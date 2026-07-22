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
});