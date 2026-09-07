// ── Referencias DOM ──────────────────────────────────────────────────────────
const registrosEl = document.getElementById('registros');
const btnAdd = document.getElementById('btn-add');
const btnCalc = document.getElementById('btn-calc');
const errorMsg = document.getElementById('error-msg');
const resultado = document.getElementById('resultado');
const inputHoras = document.getElementById('jornada-horas');
const inputMinutos = document.getElementById('jornada-minutos');
const configPreview = document.getElementById('config-preview');

// ── Preview de jornada ────────────────────────────────────────────────────────
function actualizarPreview() {
  const h = parseInt(inputHoras.value) || 0;
  const m = parseInt(inputMinutos.value) || 0;
  configPreview.textContent = `${h}h ${String(m).padStart(2, '0')}m`;
}

inputHoras.addEventListener('input', actualizarPreview);
inputMinutos.addEventListener('input', actualizarPreview);
actualizarPreview();

// ── Utilidades de tiempo ──────────────────────────────────────────────────────

/** "07:56:12" → segundos. Acepta "07:56" sin segundos. */
function parseTime(str) {
  if (!str) return null;
  const parts = str.split(':').map(Number);
  if (parts.length === 2) parts.push(0);
  const [h, m, s] = parts;
  if (isNaN(h) || isNaN(m) || isNaN(s)) return null;
  return h * 3600 + m * 60 + s;
}

/** Segundos (absolutos) → "HH:MM:SS" */
function formatSecs(secs) {
  const neg = secs < 0;
  secs = Math.abs(Math.round(secs));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = n => String(n).padStart(2, '0');
  return (neg ? '-' : '') + `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Segundos del día → "HH:MM:SS" con wrap 24h */
function secsToHHMMSS(secs) {
  secs = ((Math.round(secs) % 86400) + 86400) % 86400;
  return formatSecs(secs);
}

// ── Gestión de filas ──────────────────────────────────────────────────────────
let filaCount = 0;

function crearFila(entradaVal = '', salidaVal = '') {
  filaCount++;
  const n = filaCount;

  const div = document.createElement('div');
  div.className = 'fila';
  div.dataset.id = n;

  div.innerHTML = `
    <span class="fila-label">${n}</span>
    <input type="time" step="1" class="entrada" value="${entradaVal}"
           id="entrada-${n}" title="Hora de entrada" />
    <input type="time" step="1" class="salida" value="${salidaVal}"
           id="salida-${n}" title="Hora de salida (dejar vacío en el último tramo)" />
    <button class="btn-remove" title="Eliminar tramo" data-fila="${n}">✕</button>
  `;

  div.querySelector('.btn-remove').addEventListener('click', () => {
    if (registrosEl.querySelectorAll('.fila').length <= 1) return;
    div.remove();
    renumerarFilas();
  });

  return div;
}

function renumerarFilas() {
  registrosEl.querySelectorAll('.fila').forEach((fila, i) => {
    fila.querySelector('.fila-label').textContent = i + 1;
  });
}

function agregarFila(entradaVal = '', salidaVal = '') {
  registrosEl.appendChild(crearFila(entradaVal, salidaVal));
}

// Inicializar con 3 filas vacías
agregarFila();
agregarFila();
agregarFila();

btnAdd.addEventListener('click', () => {
  agregarFila();
  // Hacer scroll suave a la nueva fila
  registrosEl.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// ── Cálculo principal ─────────────────────────────────────────────────────────
btnCalc.addEventListener('click', calcular);

function calcular() {
  errorMsg.textContent = '';
  resultado.hidden = true;

  const banner = document.getElementById('resultado-banner');
  if (banner) {
    banner.style.display = 'none';
    banner.textContent = '';
  }

  // Jornada configurada en segundos
  const h = parseInt(inputHoras.value);
  const m = parseInt(inputMinutos.value);
  if (isNaN(h) || isNaN(m) || h < 0 || m < 0 || m > 59) {
    errorMsg.textContent = 'Introduce un value de jornada válido (ej. 8h 15m).';
    return;
  }
  const jornadaSecs = h * 3600 + m * 60;
  if (jornadaSecs === 0) {
    errorMsg.textContent = 'La jornada debe ser mayor de 0 minutos.';
    return;
  }

  // Leer pares de la tabla
  const filas = [...registrosEl.querySelectorAll('.fila')];
  const pares = filas.map(f => ({
    entrada: parseTime(f.querySelector('.entrada').value),
    salida: parseTime(f.querySelector('.salida').value),
  }));

  // Validaciones
  let ultimaEntrada = null;
  let trabajadoSecs = 0;
  let filasConDatos = 0;

  for (let i = 0; i < pares.length; i++) {
    const { entrada, salida } = pares[i];
    const numFila = i + 1;

    if (entrada === null && salida === null) continue; // fila vacía → saltar

    filasConDatos++;

    if (entrada === null) {
      errorMsg.textContent = `Fila ${numFila}: falta la hora de entrada.`;
      return;
    }

    if (salida !== null) {
      // Tramo completo
      if (salida < entrada) {
        errorMsg.textContent = `Fila ${numFila}: la salida no puede ser anterior a la entrada.`;
        return;
      }
      trabajadoSecs += salida - entrada;
    } else {
      // Entrada sin salida → es el tramo actual (debe ser la última con datos)
      if (ultimaEntrada !== null) {
        errorMsg.textContent = `Solo puedes dejar vacía la última salida. Revisa la fila ${numFila}.`;
        return;
      }
      ultimaEntrada = entrada;
    }
  }

  if (filasConDatos === 0) {
    errorMsg.textContent = 'Introduce al menos una hora de entrada.';
    return;
  }

  // --- NUEVA LÓGICA DE CÁLCULO ---
  const ahora = new Date();
  const ahoraSecs = ahora.getHours() * 3600 + ahora.getMinutes() * 60 + ahora.getSeconds();

  const totalTrabajadoSecs = trabajadoSecs + (ultimaEntrada !== null ? (ahoraSecs - ultimaEntrada) : 0);
  const yaCompletada = totalTrabajadoSecs >= jornadaSecs;

  document.getElementById('res-trabajado').textContent = formatSecs(totalTrabajadoSecs);

  if (yaCompletada) {
    if (ultimaEntrada !== null) {
      // Fichado dentro y jornada completada (horas extra en curso)
      const restanteSecs = jornadaSecs - trabajadoSecs;
      const salidaSecs = ultimaEntrada + restanteSecs;
      const extraSecs = totalTrabajadoSecs - jornadaSecs;
      const mensajeExtra = localStorage.getItem('kairos_mensaje_extra') || 'Vete a que te de el sol!';

      document.getElementById('res-restante').innerHTML = `
        00:00:00 <br>
        <small style="font-size: 0.75em; font-weight: bold; color: var(--success, #10b981);">
          (+${formatSecs(extraSecs)} extra)
        </small>
      `;
      document.getElementById('res-salida').textContent = secsToHHMMSS(salidaSecs);

      if (banner) {
        banner.textContent = mensajeExtra;
        banner.style.display = 'block';
      }
    } else {
      // Fichado fuera y jornada completada
      document.getElementById('res-restante').innerHTML = `
        00:00:00 <br>
        <small style="font-size: 0.75em; opacity: 0.8; font-weight: normal;">
          (¡Jornada completada!)
        </small>
      `;
      document.getElementById('res-salida').textContent = 'Completada';
    }
  } else if (ultimaEntrada === null) {
    // Fichado fuera y jornada sin terminar (p. ej. descanso no laboral)
    const restanteSecs = jornadaSecs - trabajadoSecs;
    document.getElementById('res-restante').innerHTML = `
      ${formatSecs(restanteSecs)} <br>
      <small style="font-size: 0.75em; opacity: 0.8; font-weight: normal;">
        (Actualmente fuera)
      </small>
    `;
    document.getElementById('res-salida').textContent = 'Indeterminada';
  } else {
    // Fichado dentro y jornada sin terminar
    const restanteSecs = jornadaSecs - trabajadoSecs;
    const salidaSecs = ultimaEntrada + restanteSecs;

    let restanteDesdeAhoraSecs = salidaSecs - ahoraSecs;
    if (restanteDesdeAhoraSecs < 0) restanteDesdeAhoraSecs = 0;

    document.getElementById('res-restante').innerHTML = `
      ${formatSecs(restanteSecs)} <br>
      <small style="font-size: 0.75em; opacity: 0.8; font-weight: normal;">
        (${formatSecs(restanteDesdeAhoraSecs)} desde ahora)
      </small>
    `;
    document.getElementById('res-salida').textContent = secsToHHMMSS(salidaSecs);
  }

  // --- ACTUALIZAR CÍRCULO DE PROGRESO ---
  const progressPercent = Math.min(totalTrabajadoSecs / jornadaSecs, 1);
  const circle = document.querySelector('.progress-ring__circle');
  if (circle) {
    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progressPercent * circumference);
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = offset;

    if (yaCompletada) {
      circle.classList.add('completado');
    } else {
      circle.classList.remove('completado');
    }
  }

  const progressIcon = document.getElementById('progress-icon');
  if (progressIcon) {
    if (yaCompletada) {
      progressIcon.textContent = '🎉';
    } else if (ultimaEntrada === null) {
      progressIcon.textContent = '⏳';
    } else {
      progressIcon.textContent = '🕐';
    }
  }

  resultado.hidden = false;
  resultado.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── KairosHR: importar fichajes y jornada ───────────────────────────────────────
const btnKairos = document.getElementById('btn-kairos');
const kairosStatus = document.getElementById('kairos-status');
const kairosDniEl = document.getElementById('kairos-dni');
const kairosCodeEl = document.getElementById('kairos-code');

// Permitir lanzar la petición pulsando Enter en cualquiera de los dos inputs
[kairosDniEl, kairosCodeEl].forEach(input => {
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') btnKairos.click();
  });
});

btnKairos.addEventListener('click', async () => {
  const nif = kairosDniEl.value.trim().toUpperCase();
  const codigo = kairosCodeEl.value.trim();
  kairosCodeEl.value = '';

  if (!nif) {
    setKairosStatus('error', 'Introduce el NIF/DNI del empleado.');
    kairosDniEl.focus();
    return;
  }
  if (!codigo) {
    setKairosStatus('error', 'Introduce el código de acceso.');
    kairosCodeEl.focus();
    return;
  }

  setKairosStatus('loading', 'Validando credenciales…');
  btnKairos.disabled = true;

  try {
    // 1. Validar contra el backend local /validate-user
    const authRes = await fetch('/validate-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni: nif, codigo })
    });

    if (!authRes.ok) {
      document.getElementById('kairos-dni-label').textContent = 'NIF / DNI del empleado';
      const authErr = await authRes.json().catch(() => ({}));
      throw new Error(authErr.message || 'Datos erróneos.');
    }

    const authData = await authRes.json();
    const nombre = authData.nombre || 'empleado';
    document.getElementById('kairos-dni-label').textContent = `¡Hola, ${nombre}!`;

    localStorage.setItem('kairos_dni', nif);
    localStorage.setItem('kairos_mensaje_extra', authData.mensaje_extra || '');
    setKairosStatus('loading', 'Conectando con KairosHR…');

    const hoy = new Date().toISOString().slice(0, 10);
    KairosService.logout();

    const [records, horasPlanificadas] = await Promise.all([
      KairosService.getCheckins({ nif, date_start: hoy, date_end: hoy }),
      KairosService.getSchedule({ nif, date_start: hoy, date_end: hoy })
    ]);

    let infoJornada = '';
    if (horasPlanificadas !== null && !isNaN(horasPlanificadas)) {
      const totalMinutosTotal = Math.round(horasPlanificadas * 60);
      const hConfig = Math.floor(totalMinutosTotal / 60);
      const mConfig = totalMinutosTotal % 60;

      inputHoras.value = hConfig;
      inputMinutos.value = mConfig;

      actualizarPreview();
      infoJornada = ` e introducida jornada de ${hConfig}h ${String(mConfig).padStart(2, '0')}m`;
    }

    if (!records.length) {
      setKairosStatus('warn', `No se encontraron fichajes para hoy${infoJornada ? '.' + infoJornada : '.'}`);
      return;
    }

    const pares = KairosService.parsearFichajes(records, nif);

    if (!pares.length) {
      setKairosStatus('warn',
        `Se recibieron ${records.length} registro(s) pero no se interpretaron como pares. Horario actualizado.`);
      return;
    }

    registrosEl.innerHTML = '';
    filaCount = 0;

    pares.forEach(({ entrada, salida }) => agregarFila(entrada, salida));

    const ultimaFila = registrosEl.lastElementChild;
    const ultimaSalida = ultimaFila?.querySelector('.salida');
    if (ultimaSalida && ultimaSalida.value) {
      agregarFila();
    }

    setKairosStatus('ok', `✓ ${pares.length} tramo(s) importado(s) correctamente${infoJornada}.`);

    // Ejecutar el cálculo automáticamente tras importar los fichajes
    calcular();
  } catch (err) {
    console.error('[KairosHR]', err);
    setKairosStatus('error', err.message || 'Error inesperado al conectar con la API.');
  } finally {
    btnKairos.disabled = false;
  }
});

function setKairosStatus(tipo, texto) {
  kairosStatus.textContent = texto;
  kairosStatus.className = `kairos-status kairos-status--${tipo}`;
}

function cargarDniGuardado() {
  const dniGuardado = localStorage.getItem('kairos_dni');
  const inputDni = document.getElementById('kairos-dni') || kairosDniEl;

  if (dniGuardado && inputDni) {
    inputDni.value = dniGuardado;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  cargarDniGuardado();
  initAusenciasModule();
});

// ── Módulo de Ausencias y Presencia ──────────────────────────────────────────
let ausenciasState = {
  employees: [],
  filter: 'all',
  search: '',
  loaded: false
};

function getFormattedToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getFormattedFutureDate(days = 30) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function areDatesConsecutive(endDateStr, startDateStr) {
  if (!endDateStr || !startDateStr) return false;
  const end = endDateStr.split(' ')[0];
  const start = startDateStr.split(' ')[0];
  if (start <= end) return true; // Se solapan o mismo día

  // Comprobar si entre la fecha fin y la fecha inicio sólo hay fin de semana o días adyacentes
  const d = new Date(end + 'T00:00:00');
  const dTarget = new Date(start + 'T00:00:00');

  d.setDate(d.getDate() + 1);
  while (d < dTarget) {
    const dayOfWeek = d.getDay(); // 0 = Domingo, 6 = Sábado
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      return false; // Hay un día laborable entre medias
    }
    d.setDate(d.getDate() + 1);
  }
  return true;
}

function formatFechaVuelta(dateStr) {
  if (!dateStr) return '—';
  const parts = dateStr.trim().split(' ');
  const datePart = parts[0]; // "YYYY-MM-DD"

  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return dateStr;

  return `${d}/${m}/${y}`;
}

function initAusenciasModule() {
  const btnRefresh = document.getElementById('btn-refresh-ausencias');
  const searchInput = document.getElementById('ausencias-search');
  const chips = document.querySelectorAll('.ausencias-filter-chips .chip');

  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => cargarListadoAusencias());
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      ausenciasState.search = e.target.value;
      renderListadoAusencias();
    });
  }

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      ausenciasState.filter = chip.dataset.filter || 'all';
      renderListadoAusencias();
    });
  });
}

async function cargarListadoAusencias() {
  const container = document.getElementById('ausencias-container');
  const btnRefresh = document.getElementById('btn-refresh-ausencias');
  if (!container) return;

  if (btnRefresh) {
    btnRefresh.disabled = true;
    btnRefresh.classList.add('loading');
  }

  container.innerHTML = `
    <div class="ausencias-loading">
      <div class="spinner"></div>
      <span>Cargando plantilla y fichajes de KairosHR...</span>
    </div>
  `;

  try {
    const today = getFormattedToday();
    const dateEndFuture = getFormattedFutureDate(30);

    // 1. Obtener datos simultáneos de los 3 endpoints (consultamos ausencias con ventana futura para detectar permisos consecutivos)
    const [employeesRaw, absencesRaw, checkinsRaw] = await Promise.all([
      KairosService.getEmployees(),
      KairosService.getAbsences({ date_start: today, date_end: dateEndFuture }),
      KairosService.getCheckins({ date_start: today, date_end: today })
    ]);

    // 2. Filtrar únicamente empleados activos
    const activeEmployees = employeesRaw.filter(emp => emp.active === true || emp.active === 'true');

    // 3. Cruzar datos por NIF
    ausenciasState.employees = activeEmployees.map(emp => {
      const name = `${emp.name || ''} ${emp.lastname || emp.last_name || ''}`.trim();
      const empNif = (emp.nif || '').trim().toUpperCase();

      // Buscar todas las ausencias del empleado ordenadas cronológicamente
      const empAbsences = absencesRaw
        .filter(abs => (abs.nif || '').trim().toUpperCase() === empNif)
        .sort((a, b) => (a.date_start || '').localeCompare(b.date_start || ''));

      // Buscar si el empleado tiene una ausencia activa para hoy
      const absenceToday = empAbsences.find(abs => {
        const start = (abs.date_start || '').split(' ')[0];
        const end = (abs.date_end || '').split(' ')[0];
        return start <= today && end >= today;
      });

      // Buscar fichajes para hoy
      const empCheckins = checkinsRaw.filter(chk => {
        const chkNif = (chk.nif || '').trim().toUpperCase();
        return chkNif === empNif;
      });

      // Ordenar fichajes cronológicamente
      empCheckins.sort((a, b) => {
        const ta = `${a.date || ''}T${a.time || ''}`;
        const tb = `${b.date || ''}T${b.time || ''}`;
        return ta.localeCompare(tb);
      });

      const lastCheckin = empCheckins.length > 0 ? empCheckins[empCheckins.length - 1] : null;

      // Evaluar si está trabajando:
      // 1) El último fichaje es de entrada (entry).
      // 2) O el último fichaje es de salida pero de tipo 'break', 'breakfast' o 'lunch'.
      let isWorking = false;
      let workingMode = 'presencial';

      if (lastCheckin) {
        const action = (lastCheckin.action || '').toLowerCase();
        const type = (lastCheckin.type || '').toLowerCase();

        const isEntry = action === 'entry' || action.includes('in') || action.includes('entrada');
        const isBreakExit = (action === 'exit' || action.includes('out') || action.includes('salida')) &&
          (type.includes('break') || type.includes('breakfast') || type.includes('lunch'));

        if (isEntry || isBreakExit) {
          isWorking = true;

          // Determinar la modalidad (si en algún fichaje del día se registró teletrabajo)
          const hasTelework = empCheckins.some(c => (c.type || '').toLowerCase().includes('tele'));
          workingMode = hasTelework ? 'teletrabajo' : 'presencial';
        }
      }

      // Asignar estado, clase de badge, texto y fecha de vuelta
      let estado = 'ausente';
      let badgeClass = '';
      let badgeText = '';
      let fechaVuelta = '—';

      if (isWorking) {
        estado = 'trabajando';
        if (workingMode === 'teletrabajo') {
          badgeClass = 'badge-working-tele';
          badgeText = '💻 Trabajando (Teletrabajo)';
        } else {
          badgeClass = 'badge-working-office';
          badgeText = '🏢 Trabajando (Presencial)';
        }
      } else if (absenceToday) {
        estado = 'ausente';
        const type = (absenceToday.type || '').toUpperCase();
        const isBaja = type === 'L' || type === 'B' || type === 'IT' || type.includes('BAJA') || type.includes('MEDIC');

        if (!isBaja) {
          // Vacaciones y permisos: el tag se mantiene como "Vacaciones"
          badgeClass = 'badge-absent-vacaciones';
          badgeText = '🏖️ Vacaciones';

          // Calcular la fecha fin encadenando ausencias consecutivas (ej: vacaciones seguidas de permiso)
          let effectiveDateEnd = absenceToday.date_end;
          let currentEnd = (absenceToday.date_end || '').split(' ')[0];

          for (const nextAbs of empAbsences) {
            const nextStart = (nextAbs.date_start || '').split(' ')[0];
            const nextEnd = (nextAbs.date_end || '').split(' ')[0];
            const nextType = (nextAbs.type || '').toUpperCase();
            const nextIsBaja = nextType === 'L' || nextType === 'B' || nextType === 'IT' || nextType.includes('BAJA');

            if (nextEnd > currentEnd && !nextIsBaja) {
              if (nextStart <= currentEnd || areDatesConsecutive(currentEnd, nextStart)) {
                currentEnd = nextEnd;
                effectiveDateEnd = nextAbs.date_end;
              }
            }
          }

          fechaVuelta = formatFechaVuelta(effectiveDateEnd);
        } else {
          // Bajas médicas: mostrar simplemente "Ausente" sin indicar fecha fin
          badgeClass = 'badge-absent-permiso';
          badgeText = '📋 Ausente';
          fechaVuelta = '—';
        }
      } else {
        // Ni fichado entrada ni ausencia registrada en sistema
        estado = 'ausente';
        badgeClass = 'badge-absent-sinfichar';
        badgeText = '⚪ Ausente';
      }

      return {
        name,
        nif: empNif,
        estado,
        isWorking,
        badgeClass,
        badgeText,
        fechaVuelta
      };
    });

    // Ordenar alfabéticamente por nombre
    ausenciasState.employees.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    ausenciasState.loaded = true;

    renderListadoAusencias();
  } catch (err) {
    console.error('[Ausencias]', err);
    container.innerHTML = `
      <div class="ausencias-error">
        <span>⚠️ Error al cargar el listado: ${err.message || 'Error de conexión'}.</span>
        <button class="btn-refresh" onclick="cargarListadoAusencias()">Reintentar</button>
      </div>
    `;
  } finally {
    if (btnRefresh) {
      btnRefresh.disabled = false;
      btnRefresh.classList.remove('loading');
    }
  }
}

function renderListadoAusencias() {
  const container = document.getElementById('ausencias-container');
  if (!container) return;

  const { employees, filter, search, loaded } = ausenciasState;

  if (!loaded) {
    container.innerHTML = `
      <div class="ausencias-empty">
        <span>Haz clic en <strong>"Obtener datos"</strong> para consultar el estado actual de la plantilla.</span>
      </div>
    `;
    return;
  }

  const query = search.trim().toLowerCase();
  const filtered = employees.filter(emp => {
    if (query && !emp.name.toLowerCase().includes(query)) {
      return false;
    }
    if (filter === 'working' && emp.estado !== 'trabajando') return false;
    if (filter === 'absent' && emp.estado !== 'ausente') return false;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="ausencias-empty">
        <span>No se encontraron empleados para los criterios seleccionados.</span>
      </div>
    `;
    return;
  }

  const rowsHtml = filtered.map(emp => `
    <tr>
      <td class="emp-name-cell">${emp.name}</td>
      <td><span class="badge ${emp.badgeClass}">${emp.badgeText}</span></td>
      <td>${emp.fechaVuelta !== '—' ? `<span class="vuelta-date">📅 ${emp.fechaVuelta}</span>` : '<span class="vuelta-none">—</span>'}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="emp-table-wrapper">
      <table class="emp-table">
        <thead>
          <tr>
            <th>Empleado</th>
            <th>Estado / Modalidad</th>
            <th>Fecha de vuelta</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}