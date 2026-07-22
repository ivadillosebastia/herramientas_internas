// ── KairosHR Service ──────────────────────────────────────────────────────────
// API: https://portal.kairoshr.es/api-service/v1  (a través del proxy → proxy.js)

const KairosService = (() => {
  // URL base vacía → rutas relativas (/login, /checkin/list…)
  // El proxy (proxy.js) sirve el HTML y reenvía las llamadas API a KairosHR.
  // Así funciona con cualquier IP de servidor sin tocar este fichero.
  const BASE_URL = '';
  const COMPANY_ID = 9012;
  const API_KEY = '85bd5878-fcdd-44ff-aee2-45721040d849'; // campo "key" del login

  let _authToken = null;

  // ── Login ─────────────────────────────────────────────────────────────────
  /**
   * Autentica contra la API de KairosHR y obtiene el token de sesión.
   *
   * Payload real: { company: <number>, key: <string> }
   * Respuesta:    { status: "OK", data: { token: "<jwt>" } }
   *
   * @returns {Promise<string>} Token JWT de autenticación
   */
  async function login() {
    const res = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: COMPANY_ID, key: API_KEY }),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(`Login fallido (${res.status})${msg ? ': ' + msg : ''}.`);
    }

    const json = await res.json();

    if (json.status !== 'OK') {
      throw new Error(`Login rechazado por la API: ${json.message ?? json.code ?? 'error desconocido'}.`);
    }

    // El token llega en data.data.token según la documentación
    const token = json.data?.token ?? null;
    if (!token) {
      throw new Error('La respuesta de login no contiene un token válido.');
    }

    _authToken = token;
    return token;
  }

  // ── Obtener fichajes ──────────────────────────────────────────────────────
  /**
   * Obtiene los fichajes de un rango de fechas, opcionalmente filtrados por NIF.
   * Realiza login automáticamente si no hay token activo.
   *
   * Limitaciones de la API:
   * - Sin NIF:    máximo 1 mes entre date_start y date_end
   * - Con NIF:    máximo 3 meses entre date_start y date_end
   *
   * @param {object}  opts
   * @param {string}  [opts.nif]        - NIF del empleado (sin él devuelve todos)
   * @param {string}  [opts.date_start] - Fecha inicio YYYY-MM-DD (por defecto: ayer)
   * @param {string}  [opts.date_end]   - Fecha fin   YYYY-MM-DD (por defecto: hoy)
   * @returns {Promise<object[]>}  Array de registros de fichaje
   */
  async function getCheckins({ nif, date_start, date_end } = {}) {
    if (!_authToken) await login();

    const params = new URLSearchParams();
    if (nif) params.set('nif', nif);
    if (date_start) params.set('date_start', date_start);
    if (date_end) params.set('date_end', date_end);

    const res = await fetch(`${BASE_URL}/checkin/list?${params}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${_authToken}` },
    });

    if (res.status === 401) {
      // Token expirado → renovar y reintentar una vez
      _authToken = null;
      await login();
      return getCheckins({ nif, date_start, date_end });
    }

    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(`Error al obtener fichajes (${res.status})${msg ? ': ' + msg : ''}.`);
    }

    const json = await res.json();

    if (json.status !== 'OK') {
      throw new Error(`La API rechazó la petición de fichajes: ${json.message ?? json.code ?? 'error desconocido'}.`);
    }

    // Respuesta real: { status, data: { records: [...] } }
    return json.data?.records ?? [];
  }

  // ── Obtener horario planificado (Jornada) ──────────────────────────────────
  /**
   * Obtiene la jornada planificada para un empleado en un día concreto.
   *
   * @param {object} opts
   * @param {string} [opts.nif]        - NIF del empleado
   * @param {string} [opts.date_start] - Fecha inicio YYYY-MM-DD (por defecto: hoy)
   * @param {string} [opts.date_end]   - Fecha fin   YYYY-MM-DD (por defecto: +1 semana)
   * @returns {Promise<number|null>} Horas totales planificadas en formato numérico o null si no hay datos
   */
  async function getSchedule({ nif, date_start, date_end } = {}) {
    if (!_authToken) await login();

    const params = new URLSearchParams();
    if (nif) params.set('nif', nif);
    if (date_start) params.set('date_start', date_start);
    if (date_end) params.set('date_end', date_end);

    const res = await fetch(`${BASE_URL}/employees/schedules?${params}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${_authToken}` },
    });

    if (res.status === 401) {
      // Token expirado → renovar y reintentar una vez
      _authToken = null;
      await login();
      return getSchedule({ nif, date_start, date_end });
    }

    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(`Error al obtener el horario (${res.status})${msg ? ': ' + msg : ''}.`);
    }

    const json = await res.json();

    if (json.status !== 'OK') {
      throw new Error(`La API rechazó la petición de horario: ${json.message ?? json.code ?? 'error desconocido'}.`);
    }

    const records = json.data?.records ?? [];
    if (records.length > 0) {
      // Filtrar por NIF en local si vinieran de más empleados, o tomar el primero
      const record = nif ? records.find(r => r.nif === nif) : records[0];
      return record ? record.hours : null;
    }

    return null;
  }

  // ── Parsear fichajes → pares entrada/salida ───────────────────────────────
  /**
   * Convierte la lista de registros de /checkin/list en pares { entrada, salida }
   * listos para rellenar las filas de la calculadora.
   *
   * Estructura real de cada registro:
   * { nif, action: "entry"|"exit", date: "YYYY-MM-DD", time: "HH:MM:SS", ... }
   *
   * @param {object[]} records  - Array devuelto por getCheckins()
   * @param {string}   [nif]    - Si se pasa, filtra solo los registros de ese NIF
   * @returns {{ entrada: string, salida: string }[]}
   */
  function parsearFichajes(records, nif) {
    let lista = nif
      ? records.filter(r => r.nif === nif)
      : records;

    // Ordenar cronológicamente (date + time)
    lista = [...lista].sort((a, b) => {
      const ta = `${a.date}T${a.time}`;
      const tb = `${b.date}T${b.time}`;
      return ta.localeCompare(tb);
    });

    const pares = [];
    let parActual = null;

    for (const reg of lista) {
      const tipo = _extractType(reg);   // 'entry' → 'in' | 'exit' → 'out'
      const hora = reg.time ?? '';      // "HH:MM:SS"

      if (tipo === 'in') {
        parActual = { entrada: hora, salida: '' };
        pares.push(parActual);
      } else if (tipo === 'out' && parActual) {
        parActual.salida = hora;
        parActual = null;
      }
    }

    return pares;
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  /**
   * Normaliza el campo `action` de la API a los valores internos 'in' / 'out'.
   * Valores conocidos: "entry" → 'in', "exit" → 'out'
   */
  function _extractType(reg) {
    const action = (reg.action ?? '').toLowerCase();
    if (action === 'entry' || action.includes('in') || action.includes('entrada')) return 'in';
    if (action === 'exit' || action.includes('out') || action.includes('salida')) return 'out';
    return action;
  }

  /** Resetea el token (útil al cambiar de usuario) */
  function logout() {
    _authToken = null;
  }

  // ── API pública ───────────────────────────────────────────────────────────
  return { login, getCheckins, getSchedule, parsearFichajes, logout };
})();