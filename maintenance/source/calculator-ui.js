(() => {
  'use strict';
  const engine = createCalculator(DATTS_CATALOG);
  const { families, roomTypes, series, number } = engine;
  const $ = id => document.getElementById(id);
  const fmt = (n, digits = 2) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: digits });
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const icon = name => `<img class="png-ui-icon" data-icon="${name}" src="${DATTS_ICONS[name]}" width="36" height="36" alt="" aria-hidden="true">`;
  const link = (url, name, attrs = '') =>
    `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" ${attrs}>${esc(name)}</a>`;
  const option = (value, label, selected) =>
    `<option value="${esc(value)}" ${selected ? 'selected' : ''}>${esc(label)}</option>`;
  const chevron = '<span class="chevron" aria-hidden="true"></span>';
  const priceLabel = 'Сумма показанных позиций';
  let nextId = 1;
  let openPicker = null;
  let last = [];
  let requestMode = 'kit';
  let variantSignature = '';
  let variantHistory = [];
  let variantPosition = -1;
  let variantSeen = new Set();
  const track = event => window.dattsTrack?.(event);

  function newFixture(amount = 'auto') {
    return { id: nextId++, family: 'custom', series: null, model: 'auto', lumens: 1000,
      amount, fixed: amount === 'auto' ? 1 : amount, role: 'general', angle: null, cct: null };
  }

  function newRoom(type = 'living') {
    return { id: nextId++, type, area: 20, height: '', plane: '', emode: 'auto',
      manualE: 200, k: 1.2, eta: .5, bathZone: '', expanded: false, fixtures: [newFixture()] };
  }

  let rooms = [newRoom()];
  let selected = rooms[0].id;
  const active = () => rooms.find(r => r.id === selected);
  const roomName = room => roomTypes[room.type].name + (rooms.length > 1 ? ' ' + (rooms.indexOf(room) + 1) : '');
  const amountLabel = (n, strip) => fmt(n) + (strip ? ' м' : ' шт.');
  const quantityText = (pieces, metres) =>
    [pieces ? amountLabel(pieces, false) : '', metres ? amountLabel(metres, true) + ' ленты' : ''].filter(Boolean).join(' + ') || '—';

  function tabs() {
    $('roomtabs').classList.toggle('single-room', rooms.length === 1);
    $('roomtabs').innerHTML = rooms.map(r => `<div class="tabgroup">
      <button class="roomtab ${selected === r.id ? 'active' : ''}" data-room="${r.id}" type="button"
        aria-pressed="${selected === r.id}">${roomName(r)} <span class="tabmini" data-area="${r.id}"></span></button>
      ${rooms.length > 1 ? `<button class="tabremove" type="button" data-remove="${r.id}"
        aria-label="Удалить комнату ${roomName(r)}">×</button>` : ''}
    </div>`).join('');
  }

  function roomChoices(r) {
    $('roomchoices').innerHTML = Object.entries(roomTypes).map(([id, type]) =>
      `<button data-type="${id}" class="choice ${id === r.type ? 'selected' : ''}" aria-pressed="${id === r.type}" type="button">
        ${icon(id)}<span>${type.name}</span></button>`).join('');
  }

  function numberInput(id, name, value, min, step, unit, data = '', quick = false) {
    return `<div class="field ${quick ? 'quick-field' : ''}">
      <label class="blocklabel" for="${id}">${name}</label>
      <div class="inputbox"><input id="${id}" class="textinput" type="number" inputmode="${step === '1' ? 'numeric' : 'decimal'}"
        min="${min}" step="${step}" value="${esc(value)}" ${data}>${unit ? `<span class="suffix">${unit}</span>` : ''}</div>
      ${quick ? `<output class="quick-result" id="quickResult" for="${id} area" aria-label="Количество светильников"></output>` : ''}
    </div>`;
  }

  function familyPicker(r, f) {
    const expanded = openPicker === f.id;
    return `<button id="family-${f.id}" class="family-picker" type="button" data-picker="${f.id}" aria-expanded="${expanded}"
      aria-controls="picker-${f.id}">${icon(f.family)}<span>${families[f.family].name}</span>${chevron}</button>
    <div id="picker-${f.id}" class="family-menu" ${expanded ? '' : 'hidden'}>${Object.entries(families).map(([id, family]) => {
      const enabled = id === 'custom' || engine.available(id, r).some(s => s.enabled);
      return `<div class="family-option">
        <button type="button" data-family="${id}" data-fi="${f.id}" aria-pressed="${id === f.family}" ${enabled ? '' : 'disabled'}>
          ${icon(id)}<span>${family.name}</span></button>
        ${enabled ? '' : link(family.series[0][3], 'Открыть каталог')}
      </div>`;
    }).join('')}</div>`;
  }

  function catalogFields(r, f) {
    const entries = engine.available(f.family, r);
    const selectable = entries.filter(s => s.enabled);
    const excluded = entries.filter(s => !s.enabled);
    const isLamp = engine.choicesFor(f.series, r)[0]?.product.kind === 'lamp';
    return `<div class="fixgrid catalog-fields">
      ${selectable.length ? `<div class="field">
        <label class="blocklabel" for="series-${f.id}">Серия</label>
        <select id="series-${f.id}" class="dropdown" data-field="series" data-fi="${f.id}">
          ${selectable.map(s => option(s.id, s.name, f.series === s.id)).join('')}
        </select></div>
      <div class="field">
        <label class="blocklabel" for="model-${f.id}">${isLamp ? 'Лампа' : 'Модель'}</label>
        <select id="model-${f.id}" class="dropdown" data-field="model" data-fi="${f.id}">
          ${modelOptions(r, f)}
        </select></div>` : ''}
      ${excluded.length ? `<details class="series-unavailable full"><summary>Серии без автоподбора</summary><ul>
        ${excluded.map(s => `<li>${link(s.url, s.name)} <span>${esc(s.reason || 'Нет проверенного комплекта для этих условий.')}</span></li>`).join('')}
      </ul></details>` : ''}
    </div>`;
  }

  function modelOptions(r, f) {
    return option('auto', 'Подобрать автоматически', f.model === 'auto') +
      engine.matchingChoices(f, r).map(({ product: p }) => option(p.sku,
        `${p.sku} · ${fmt(p.watts)} Вт · ${fmt(p.lumens)} лм${f.family === 'strip' ? '/м' : ''} · ${p.cct} К`, f.model === p.sku)).join('');
  }

  function fixtures(r) {
    $('fixtures').innerHTML = r.fixtures.map((f, index) => {
      const own = f.family === 'custom';
      const strip = f.family === 'strip';
      const isAuto = f.amount === 'auto' && f.role !== 'accent';
      const { cct, angle } = engine.selection(f, r);
      const input = `data-fi="${f.id}"`;
      return `<div class="fixcard" data-group="${f.id}">
        ${r.fixtures.length > 1 ? `<div class="fixhead"><strong>Светильник ${index + 1}</strong>
          <button type="button" class="tinybtn" data-delete="${f.id}" aria-label="Удалить светильник ${index + 1}">Удалить</button></div>` : ''}
        ${familyPicker(r, f)}
        ${own ? numberInput('lumens-' + f.id, 'Световой поток одного светильника', f.lumens, 1, '1', 'лм',
          `data-field="lumens" ${input}`, r.fixtures.length === 1 && isAuto) : ''}
        <div class="fixgrid group-fields">
          <div class="field ${isAuto && !strip && r.fixtures.length === 1 ? 'full' : ''}"><label class="blocklabel" for="role-${f.id}">Назначение</label>
            <select class="dropdown" id="role-${f.id}" data-field="role" ${input}>
              ${option('general', 'Общее освещение', f.role === 'general')}
              ${option('work', 'Рабочая зона', f.role === 'work')}
              ${option('accent', 'Акцентная подсветка', f.role === 'accent')}
            </select>
          </div>
          ${isAuto ? (strip || r.fixtures.length > 1 ? `<p class="auto-label">${strip ? 'Автоматический метраж' : 'Автоматическое количество'}</p>` : '')
            : numberInput('amount-' + f.id, strip ? 'Длина участка' : 'Количество', f.amount, 0, strip ? 'any' : '1',
              strip ? 'м' : 'шт.', `data-field="amount" ${input}`)}
          ${f.role !== 'accent' && (!isAuto || strip) ? `<button class="link-button full" data-auto="${f.id}"
            data-enable="${!isAuto}" type="button">${isAuto ? 'Ввести длину вручную' : 'Рассчитать по оставшемуся свету'}</button>` : ''}
        </div>
        <div class="fixgrid group-fields optics-fields">
          ${numberInput('cct-' + f.id, 'Цветовая температура', cct, 1000, '1', 'К',
            `data-field="cct" ${input} placeholder="Любая" aria-describedby="filter-hint-${f.id}"`)}
          ${numberInput('angle-' + f.id, 'Угол рассеивания', angle, 1, 'any', '°',
            `data-field="angle" ${input} max="179" placeholder="Любой" aria-describedby="filter-hint-${f.id}"`)}
        </div>
        <p class="note filter-hint" id="filter-hint-${f.id}">Для подбора без ограничения оставьте поле пустым.</p>
        ${own ? '' : catalogFields(r, f)}
        <div class="group-feedback" id="feedback-${f.id}"></div>
      </div>`;
    }).join('');
    $('groupsHelp').hidden = r.fixtures.length < 2;
  }

  function showZone(r) {
    $('bathWrap').hidden = r.type !== 'bath';
    $('bathZone').value = r.bathZone;
    $('bathHint').textContent = r.bathZone === 'outside'
      ? 'Зона монтажа должна быть подтверждена на объекте.'
      : r.bathZone ? 'Для этой зоны в справочнике нет комплекта с подтверждённой защитой и допустимым монтажом.'
        : 'Укажите зону монтажа, чтобы проверить доступность оборудования DATTS.';
  }

  function renderControls(r) {
    roomChoices(r);
    for (const [id, field] of Object.entries({
      area: 'area', height: 'height', plane: 'plane', emode: 'emode', manualLux: 'manualE', reserve: 'k', eta: 'eta'
    })) $(id).value = r[field];
    $('advancedPanel').open = r.expanded;
    $('manualLuxWrap').hidden = r.emode !== 'custom';
    showZone(r);
    fixtures(r);
  }

  function rowHtml(row) {
    const p = row.item;
    const cost = engine.safePrice(row);
    const isStrip = p.kind === 'strip';
    const unitSource = cost == null ? 'Цена не подтверждена' :
      `${esc(p.priceSource)} · ${row.from ? 'от ' : ''}${fmt(p.price)} ₽/${row.unit}`;
    const variants = row.variants?.length > 1
      ? `<details class="variants"><summary>Исполнения для сравнения</summary><ul>
        ${row.variants.map(v => `<li>${link(v.url, v.sku)} ${v.price == null ? '' : '· ' + fmt(v.price) + ' ₽/шт.'}</li>`).join('')}
      </ul></details>` : '';
    const name = isStrip ? `LED-лента DATTS · ${p.voltage} В · ${fmt(p.cct, 0)} К` : p.name;
    return `<div class="prodrow" data-item="${esc(p.sku || p.id)}">
      <span class="prod-icon">${icon(row.icon)}</span>
      <div class="text">
        <strong>${amountLabel(row.qty, isStrip)} · ${link(p.url, name, 'class="product-link"')}</strong>
        <small>${[
          p.sku ? 'арт. ' + p.sku : 'серия',
          p.lumens ? fmt(p.lumens) + (isStrip ? ' лм/м' : ' лм') : '',
          p.watts && p.kind !== 'housing' ? fmt(p.watts) + (isStrip ? ' Вт/м' : ' Вт') : '',
          p.cct && !isStrip ? fmt(p.cct, 0) + ' К' : '',
          p.voltage && !isStrip ? p.voltage + ' В' : '',
          p.angle ? p.angle + '°' : p.angleMin ? p.angleMin + '–' + p.angleMax + '°' : '',
          p.kind === 'housing' ? p.socket + ', до ' + fmt(p.maxWatts) + ' Вт' : '',
        ].filter(Boolean).map(esc).join(' · ')}</small>
        ${p.urlKind === 'configuration' ? '<small>На странице DATTS выберите артикул из строки выше.</small>' : ''}
        ${row.description ? `<small>${esc(row.description)}</small>` : ''}
        ${row.rolls ? `<small>В смете ${row.rolls} × ${fmt(p.rollMetres)} м, всего ${fmt(row.billQty)} м.</small>` : ''}
        <div class="prodprice">${cost == null ? '' : `${row.from ? 'от ' : ''}${fmt(cost)} ₽ <span>·</span> `}${unitSource}</div>
        ${variants}
      </div></div>`;
  }

  function groupFeedback(fact) {
    const id = 'feedback-' + fact.fixture.id;
    if (!$(id)) return;
    const p = fact.option?.product;
    $(id).innerHTML = fact.problem ? `<p class="field-error">${esc(fact.problem)}</p>` :
      (p ? `<p class="groupnote"><strong>${amountLabel(fact.qty, fact.strip)}</strong> · ${esc(p.sku)} · ${fmt(p.lumens)} лм${fact.strip ? '/м' : ''}</p>`
        : active().fixtures.length > 1 ? `<p class="groupnote">${amountLabel(fact.qty, false)}</p>` : '') +
      (fact.geometry ? `<p class="note">Диаметр пятна ≈ ${fmt(fact.geometry)} м на расчётной поверхности. Равномерность проверяется по фотометрии.</p>` : '') +
      (p && p.angleMin != null && p.angleMax != null ? `<p class="note">Угол регулируется от ${p.angleMin}° до ${p.angleMax}°.</p>`
        : p && !fact.strip && p.angle == null ? '<p class="note">Угол рассеивания для модели не указан.</p>' : '');
  }

  function estimateValue(cost) {
    return cost.amount == null ? '—' : `${cost.from ? 'от ' : ''}${fmt(cost.amount)} ₽`;
  }

  function groupHtml(kit, showPrice = true) {
    const cost = engine.estimate(kit.rows, kit.missing);
    return `${kit.rows.map(rowHtml).join('')}
      ${kit.notes.map(text => `<p class="note">${esc(text)}</p>`).join('')}
      ${cost.missing.length ? `<p class="groupnote">Осталось уточнить — ${esc(cost.missing.join(', '))}.</p>` : ''}
      ${showPrice && cost.amount != null ? `<div class="subtotal"><span>${priceLabel}</span><strong>${estimateValue(cost)}</strong></div>` : ''}`;
  }

  function projectLists(calc) {
    const actual = calc.facts.filter(f => !f.own && (f.rows.length || f.problem));
    const own = calc.facts.filter(f => f.own && f.qty).map(f => ({ fact: f, kit: engine.alternate(calc, f) }));
    return { actual, own };
  }

  function renderResults(current) {
    const { room, pieces, metres, facts, error, demand, contributed } = current;
    const own = facts.filter(f => f.own && f.qty);
    $('resultNumber').textContent = quantityText(pieces, metres);
    if ($('quickResult')) $('quickResult').textContent = quantityText(pieces, metres);
    $('resultLabel').textContent = roomName(room);
    const problem = facts.find(f => f.problem)?.problem;
    const shortage = demand > 0 && contributed < demand - 1e-8;
    $('formula').textContent = error || [
      `Ориентир ${fmt(current.lux)} лк · ${fmt(room.area)} м² · K ${fmt(room.k)} · η ${fmt(room.eta)}`,
      ...(own.map(f => `Ваш расчёт — ${fmt(f.qty)} собственных светильников по ${fmt(f.lm)} лм.`)),
      ...(problem ? [problem] : shortage ? ['Выбранного общего света недостаточно для заданной освещённости.'] : [])
    ].join('\n');
    const totals = last.reduce((sum, c) => ({ pieces: sum.pieces + c.pieces, metres: sum.metres + c.metres }), { pieces: 0, metres: 0 });
    $('resultsRooms').innerHTML = rooms.length > 1 ? last.map(c =>
      `<div class="miniline"><span>${roomName(c.room)}</span><strong>${quantityText(c.pieces, c.metres)}</strong></div>`).join('') +
      `<div class="miniline"><strong>Всего по квартире</strong><strong>${quantityText(totals.pieces, totals.metres)}</strong></div>` : '';
    $('countRooms').textContent = rooms.length === 1 ? '1 комната' : 'Комнат: ' + rooms.length;
    const projects = last.map(projectLists);
    const actualRows = projects.flatMap(p => p.actual.flatMap(f => f.rows));
    const actualMissing = projects.flatMap(p => p.actual.flatMap(f => f.problem ? [f.problem] : f.missing));
    actualMissing.push(...last.filter(c => c.error && c.room.fixtures.some(f => f.family !== 'custom')).map(c => c.error));
    const actualCost = engine.estimate(actualRows, actualMissing);
    const anyAlternative = projects.some(p => p.own.some(o => o.kit));
    $('recTitle').textContent = actualRows.length || actualMissing.length ? 'Подбор DATTS' : anyAlternative ? 'Варианты DATTS' : 'Комплектация DATTS';
    $('recContent').innerHTML = last.map((c, i) => {
      const { actual, own } = projects[i];
      const alternatives = own.filter(o => o.kit);
      if (!actual.length && !alternatives.length && !(c.room.type === 'bath' && own.length)) return '';
      return `${rooms.length > 1 ? `<h3 class="recroom">${roomName(c.room)}</h3>` : ''}
        ${actual.map(f => `<div class="rec-group"><h4>${esc(series[f.option?.seriesId || f.fixture.series]?.name || families[f.fixture.family].name)}</h4>
          ${f.problem ? `<p class="empty">${esc(f.problem)}</p>` : groupHtml(f, rooms.length > 1 || actual.length > 1)}</div>`).join('')}
        ${alternatives.map(({ fact, kit }) => `<div class="rec-group alternative"><h4>Похожий вариант DATTS</h4>
          <p class="recsub">Замена для ${fmt(fact.qty)} собственных светильников по ${fmt(fact.lm)} лм.</p>${groupHtml(kit)}</div>`).join('')}
        ${c.room.type === 'bath' && own.length && !actual.length
          ? '<p class="note">Для ванной выполнен расчёт количества. Пригодность вашего светильника для места установки проверяется отдельно.</p>' : ''}
      `;
    }).join('');
    $('projectPrice').hidden = actualCost.amount == null;
    $('priceTitle').textContent = priceLabel + (rooms.length > 1 ? ' по квартире' : '');
    $('price').textContent = estimateValue(actualCost);
    $('catalogEmpty').hidden = Boolean($('recContent').textContent.trim());
    $('priceNote').hidden = !actualRows.length && !anyAlternative;
    $('request').hidden = !actualRows.length && !anyAlternative;
  }

  function update() {
    const signature = JSON.stringify(rooms.map(r => ({...r, expanded: undefined,
      fixtures: r.fixtures.map(f => ({...f, variantKey: undefined}))})));
    if (signature !== variantSignature) {
      rooms.forEach(r => r.fixtures.forEach(f => delete f.variantKey));
      variantSignature = signature;
      variantHistory = []; variantPosition = -1; variantSeen = new Set();
    }
    last = rooms.map(engine.calculateRoom);
    const r = active();
    const current = last.find(c => c.room === r);
    for (const tab of document.querySelectorAll('[data-area]')) {
      const area = number(rooms.find(room => room.id === Number(tab.dataset.area)).area);
      tab.textContent = area > 0 ? fmt(area) + ' м²' : '—';
    }
    if ($('scenePhoto').dataset.sceneType !== r.type) {
      $('scenePhoto').src = DATTS_SCENES[r.type];
      $('scenePhoto').dataset.sceneType = r.type;
    }
    $('sceneTitle').textContent = roomTypes[r.type].name;
    $('sceneTitle2').textContent = roomTypes[r.type].name.toLowerCase();
    $('sceneArea').textContent = number(r.area) > 0 ? fmt(r.area) + ' м²' : '—';
    $('sceneE').textContent = current.lux > 0 ? fmt(current.lux) + ' лк' : '—';
    $('sceneCount').textContent = quantityText(current.pieces, current.metres);
    $('lux').value = current.lux ?? '';
    for (const f of r.fixtures) $('feedback-' + f.id).textContent = '';
    current.facts.forEach(groupFeedback);
    renderResults(current);
    $('previousVariant').hidden = variantPosition <= 0;
    $('moreVariants').hidden = !variantGroups().length;
  }

  function render() {
    tabs();
    renderControls(active());
    update();
  }

  function focus(id) {
    $(id)?.focus({ preventScroll: true });
  }

  function normalizeCatalog(f, r) {
    if (f.family === 'custom') return true;
    let matches = engine.matchingChoices(f, r);
    if (!matches.length && !f.seriesPinned) {
      f.series = families[f.family].series.map(([id]) => id)
        .find(id => engine.matchingChoices(f, r, id).length) ?? null;
      f.model = 'auto';
      matches = engine.matchingChoices(f, r);
    }
    if (!matches.length) {
      changeFamily(r, f, 'custom');
      f.catalogFallback = true;
      notify('Нет совпадений. Выбран «Свой светильник».', 3800);
      return false;
    }
    if (!matches.some(({ product }) => product.sku === f.model)) f.model = 'auto';
    return true;
  }

  function changeFamily(r, f, family) {
    const wasStrip = f.family === 'strip';
    Object.assign(f, { family, series: null, model: 'auto', seriesPinned: false, catalogFallback: false });
    if (family === 'strip') {
      if (f.role === 'general') f.role = 'accent';
      f.amount = f.fixed = 3;
    } else if (wasStrip) {
      if (r.fixtures.length === 1 && f.role === 'accent') f.role = 'general';
      f.fixed = 1;
      f.amount = f.role !== 'accent' && !r.fixtures.some(group => group !== f && group.amount === 'auto')
        ? 'auto' : 1;
    }
  }

  function applyCatalogPreset(f, room, selectedSeries) {
    const preset = engine.catalogPreset(f, room, selectedSeries);
    if (preset) Object.assign(f, preset, { model: 'auto', seriesPinned: Boolean(selectedSeries) });
  }

  function setAuto(r, f, enable) {
    if (enable) {
      for (const other of r.fixtures.filter(group => group !== f && group.amount === 'auto')) {
        const old = last.find(c => c.room === r)?.facts.find(fact => fact.fixture === other);
        other.amount = old?.qty || other.fixed;
        other.fixed = other.amount;
      }
      f.amount = 'auto';
    } else f.amount = f.fixed;
  }

  function handleFixtureInput(el) {
    const r = active();
    const f = r.fixtures.find(group => group.id === Number(el.dataset.fi));
    if (!f) return;
    const field = el.dataset.field;
    const wasAccent = f.role === 'accent';
    f[field] = el.validity.badInput && (field === 'cct' || field === 'angle') ? '0' : el.value;
    if (field === 'amount') f.fixed = f.amount;
    if (field === 'series') {
      applyCatalogPreset(f, r, el.value);
    }
    if (field === 'role') {
      if (f.role === 'accent' && f.amount === 'auto') setAuto(r, f, false);
      if (wasAccent && f.role !== 'accent' && r.fixtures.length === 1 && f.family !== 'strip') setAuto(r, f, true);
    }
    if (['series', 'role', 'model'].includes(field)) {
      const matched = normalizeCatalog(f, r);
      fixtures(r);
      focus(matched || field === 'role' ? el.id : 'family-' + f.id);
    }
    update();
  }

  function commitFilter(el) {
    if (!['angle', 'cct'].includes(el.dataset.field) || !el.validity.valid) return;
    const r = active();
    const f = r.fixtures.find(group => group.id === Number(el.dataset.fi));
    if (!f || f.family === 'custom') return;
    if (!normalizeCatalog(f, r)) {
      const focused = document.activeElement === el;
      fixtures(r);
      if (focused) focus(el.id);
    } else {
      $('series-' + f.id).value = f.series;
      const model = $('model-' + f.id);
      model.innerHTML = modelOptions(r, f);
      model.labels[0].textContent = engine.matchingChoices(f, r)[0]?.product.kind === 'lamp' ? 'Лампа' : 'Модель';
    }
    update();
  }

  function requirementsText() {
    const lines = ['DATTS · требования к освещению'];
    const roles = {general: 'Общее освещение', work: 'Рабочая зона', accent: 'Акцентная подсветка'};
    const zones = {outside: 'Вне зон 0, 1, 2', '0': 'Зона 0', '1': 'Зона 1', '2': 'Зона 2'};
    for (const r of rooms) {
      lines.push('', roomName(r), `Площадь: ${r.area || 'не указана'} м²`,
        `Требуемая освещённость: ${engine.calculateRoom(r).lux ?? 'не указана'} лк`);
      if (r.height !== '') lines.push(`Высота потолка: ${r.height} м`);
      if (r.plane !== '') lines.push(`Высота рабочей поверхности: ${r.plane} м`);
      if (r.type === 'bath') lines.push(`Зона монтажа: ${zones[r.bathZone] || 'не указана'}`);
      r.fixtures.forEach((f, i) => {
        const {cct, angle} = engine.selection(f, r);
        lines.push(`Свет ${i+1}: ${families[f.family].name}; ${roles[f.role] || f.role}`,
          `Цветовая температура: ${cct == null ? 'без ограничения' : fmt(cct) + ' К'}`,
          `Угол рассеивания: ${angle == null ? 'без ограничения' : fmt(angle) + '°'}`);
        if (f.family === 'custom' && number(f.lumens) > 0) lines.push(`Заданный поток прибора: ${fmt(f.lumens)} лм`);
        if (f.amount !== 'auto') lines.push(`Заданное пользователем ${f.family === 'strip' ? 'количество метров' : 'количество приборов'}: ${f.amount}`);
      });
    }
    lines.push('', 'Прошу бесплатно подобрать оборудование по указанным требованиям и сообщить стоимость.');
    return lines.join('\n');
  }

  function variantGroups() {
    return rooms.flatMap(r => r.fixtures.map(f => ({r, f, options: engine.variantOptions(f, r)})))
      .filter(g => g.options.length && last.find(c => c.room === g.r)?.facts.some(f => f.fixture === g.f && !f.problem && f.qty > 0));
  }
  function currentVariantKeys(groups) {
    return groups.map(g => {
      if (g.f.variantKey) return g.f.variantKey;
      const calc = last.find(c => c.room === g.r);
      const fact = calc.facts.find(f => f.fixture === g.f);
      const option = fact?.own ? engine.alternate(calc, fact)?.option : fact?.option;
      const shell = option?.housings[0];
      return g.options.find(o => o.product.sku === option?.product.sku &&
        (!shell || o.housings[0]?.sku === shell.sku))?.key || g.options[0].key;
    });
  }
  function applyVariant(keys, groups) {
    groups.forEach((g,i) => { g.f.variantKey = keys[i]; });
    update();
  }
  function moreVariants() {
    track('more_variants');
    const groups = variantGroups();
    if (!groups.length) return notify('Других вариантов по этим требованиям нет');
    if (variantPosition < 0) {
      const keys = currentVariantKeys(groups);
      variantHistory.push(keys); variantSeen.add(JSON.stringify(keys)); variantPosition = 0;
    }
    if (variantPosition < variantHistory.length - 1) {
      applyVariant(variantHistory[++variantPosition], groups); return;
    }
    const total = groups.reduce((n,g) => n * BigInt(g.options.length), 1n);
    if (BigInt(variantSeen.size) >= total) return notify('Других вариантов по этим требованиям нет');
    let keys;
    for (let attempt=0; attempt<80; attempt++) {
      const sample = groups.map(g => g.options[Math.floor(Math.random()*g.options.length)].key);
      if (!variantSeen.has(JSON.stringify(sample))) { keys=sample; break; }
    }
    // Mixed-radix enumeration guarantees a remaining combination is found without repeating.
    if (!keys) for (let n=0n; n<total; n++) {
      let index=n;
      const sample=groups.map(g => {const radix=BigInt(g.options.length); const key=g.options[Number(index%radix)].key; index/=radix; return key;});
      if (!variantSeen.has(JSON.stringify(sample))) { keys=sample; break; }
    }
    variantSeen.add(JSON.stringify(keys)); variantHistory.push(keys); variantPosition++;
    applyVariant(keys, groups);
    notify('Показан другой подходящий комплект');
  }

  function summaryText() {
    const sections = ['DATTS · расчёт освещения'];
    const all = [];
    const missing = [];
    for (const c of last) {
      const { own, actual } = projectLists(c);
      sections.push('', `${roomName(c.room)} · ${c.room.area} м² · ${c.lux ?? '—'} лк`);
      for (const { fact, kit } of own) {
        sections.push(`Свой светильник: ${fmt(fact.qty)} шт. × ${fmt(fact.lm)} лм.`);
        if (kit) {
          sections.push('Похожий вариант DATTS', ...kit.rows.map(textLine),
            `${priceLabel} — ${estimateValue(engine.estimate(kit.rows, kit.missing))}`);
        }
      }
      for (const f of actual) {
        all.push(...f.rows);
        missing.push(...f.missing, ...(f.problem ? [f.problem] : []));
        sections.push(...f.rows.map(textLine));
        sections.push(...f.notes);
        if (f.missing.length) sections.push('Осталось уточнить — ' + f.missing.join(', '));
      }
      if (c.error) sections.push(c.error);
    }
    const cost = engine.estimate(all, missing);
    if (cost.amount != null) sections.push('', `${priceLabel} — ${estimateValue(cost)}`);
    return sections.join('\n');
  }

  function textLine(row) {
    return `${fmt(row.qty)} ${row.unit} · ${row.item.name}${row.item.sku ? ' · ' + row.item.sku : ''} · ${row.item.url}`;
  }

  function notify(message, duration = 2400) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => {
      toast.classList.remove('show');
      toast.textContent = '';
    }, duration);
  }

  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value);
      notify('Скопировано');
      return true;
    } catch {
      const field = document.createElement('textarea');
      field.value = value;
      document.body.append(field);
      field.select();
      const ok = document.execCommand('copy');
      notify(ok ? 'Скопировано' : 'Не удалось скопировать');
      field.remove();
      return ok;
    }
  }

  function closeModal() {
    $('modalbg').classList.remove('show');
    $('phone').value = '';
    focus(requestMode === 'requirements' ? 'freeSelection' : 'request');
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    const r = active();
    if (openPicker && !event.target.closest('.family-menu, .family-picker')) {
      $('picker-' + openPicker)?.setAttribute('hidden', '');
      $('family-' + openPicker)?.setAttribute('aria-expanded', 'false');
      openPicker = null;
    }
    if (!button) return;
    const data = button.dataset;
    if (data.picker) {
      const id = Number(data.picker);
      if (openPicker && openPicker !== id) {
        $('picker-' + openPicker).hidden = true;
        $('family-' + openPicker).setAttribute('aria-expanded', 'false');
      }
      openPicker = openPicker === id ? null : id;
      $('picker-' + id).hidden = openPicker !== id;
      button.setAttribute('aria-expanded', String(openPicker === id));
    }
    if (data.family) {
      const f = r.fixtures.find(group => group.id === Number(data.fi));
      if (f.family !== data.family) {
        changeFamily(r, f, data.family);
        if (f.family === 'custom') Object.assign(f, { cct: null, angle: null });
      } else if (data.family === 'custom') {
        f.catalogFallback = false;
      }
      if (f.family !== 'custom') {
        applyCatalogPreset(f, r);
        normalizeCatalog(f, r);
      }
      openPicker = null;
      fixtures(r);
      update();
      focus('family-' + f.id);
    }
    if (data.type) {
      r.type = data.type;
      r.fixtures.forEach(f => normalizeCatalog(f, r));
      render();
      document.querySelector(`[data-type="${data.type}"]`).focus({ preventScroll: true });
    }
    if (data.room) {
      selected = Number(data.room);
      render();
      document.querySelector(`[data-room="${selected}"]`).focus({ preventScroll: true });
    }
    if (data.remove && rooms.length > 1) {
      rooms = rooms.filter(room => room.id !== Number(data.remove));
      if (selected === Number(data.remove)) selected = rooms[0].id;
      render();
      document.querySelector(`[data-room="${selected}"]`).focus({ preventScroll: true });
    }
    if (data.delete && r.fixtures.length > 1) {
      const removed = r.fixtures.find(f => f.id === Number(data.delete));
      r.fixtures = r.fixtures.filter(f => f !== removed);
      if (removed.amount === 'auto') {
        const next = r.fixtures.find(f => f.role !== 'accent');
        if (next) setAuto(r, next, true);
      }
      fixtures(r);
      update();
      focus('addFixture');
    }
    if (data.auto) {
      const f = r.fixtures.find(group => group.id === Number(data.auto));
      setAuto(r, f, data.enable === 'true');
      fixtures(r);
      update();
      focus('family-' + f.id);
    }
  });

  for (const [id, field] of Object.entries({
    area: 'area', height: 'height', plane: 'plane', emode: 'emode', manualLux: 'manualE', reserve: 'k', eta: 'eta', bathZone: 'bathZone'
  })) $(id).addEventListener('input', () => {
    const r = active();
    r[field] = $(id).value;
    $('manualLuxWrap').hidden = r.emode !== 'custom';
    if (field === 'bathZone') {
      showZone(r);
      r.fixtures.forEach(f => normalizeCatalog(f, r));
      openPicker = null;
      fixtures(r);
    }
    update();
  });
  $('fixtures').addEventListener('input', event => {
    if (event.target.dataset.field) handleFixtureInput(event.target);
  });
  $('fixtures').addEventListener('change', event => commitFilter(event.target));
  $('fixtures').addEventListener('keydown', event => {
    if (event.key === 'Enter' && ['angle', 'cct'].includes(event.target.dataset.field)) event.target.blur();
  });
  $('advancedPanel').addEventListener('toggle', () => { active().expanded = $('advancedPanel').open; });
  $('addFixture').addEventListener('click', () => {
    const r = active();
    const f = newFixture(r.fixtures.some(group => group.amount === 'auto') ? 1 : 'auto');
    r.fixtures.push(f);
    fixtures(r);
    update();
    focus('family-' + f.id);
  });
  $('addRoom').addEventListener('click', () => {
    const r = newRoom(rooms.length === 1 ? 'bedroom' : 'kitchen');
    openPicker = null;
    rooms.push(r);
    selected = r.id;
    render();
    $('roomtabs').scrollIntoView({ block: 'start' });
    document.querySelector(`[data-room="${selected}"]`).focus({ preventScroll: true });
  });
  $('reset').addEventListener('click', () => {
    openPicker = null;
    rooms = [newRoom()];
    selected = rooms[0].id;
    render();
    notify('Начат новый расчёт');
  });
  function openRequest(mode) {
    requestMode = mode;
    track(mode === 'requirements' ? 'free_selection' : 'kit_offer');
    $('modalTitle').textContent = mode === 'requirements' ? 'Бесплатный подбор' : 'Получить предложение';
    $('modalIntro').textContent = mode === 'requirements'
      ? 'Требования уже заполнены. Укажите телефон — менеджер подберёт оборудование и сообщит стоимость.'
      : 'Скопируйте расчёт или откройте письмо для менеджера DATTS.';
    $('modalSummary').textContent = mode === 'requirements' ? requirementsText() : summaryText();
    $('modalbg').classList.add('show');
    $('modalStatus').textContent = '';
    focus('phone');
  }
  $('request').addEventListener('click', () => openRequest('kit'));
  $('freeSelection').addEventListener('click', () => openRequest('requirements'));
  $('moreVariants').addEventListener('click', moreVariants);
  $('previousVariant').addEventListener('click', () => {
    if (variantPosition > 0) {track('previous_variant'); applyVariant(variantHistory[--variantPosition], variantGroups());}
  });
  document.querySelector('main').addEventListener('input', () => track('parameters_changed'));
  document.querySelector('main').addEventListener('click', event => {
    if (event.target.closest('[data-type], [data-family], [data-auto], [data-delete], #addRoom, #addFixture')) track('parameters_changed');
  });
  $('closeModal').addEventListener('click', closeModal);
  $('modalbg').addEventListener('click', event => { if (event.target === $('modalbg')) closeModal(); });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if ($('modalbg').classList.contains('show')) closeModal();
    if (openPicker) {
      const id = openPicker;
      $('family-' + id).click();
      focus('family-' + id);
    }
  });
  $('copy').addEventListener('click', async () => { if (await copy(summaryText())) track('copy_calculation'); });
  $('print').addEventListener('click', () => {track('print'); window.print();});
  function requestText() {
    const phone = $('phone').value.trim();
    if (phone.replace(/\D/g, '').length < 10 || phone.replace(/\D/g, '').length > 15) {
      notify('Укажите номер телефона полностью');
      return null;
    }
    return (requestMode === 'requirements' ? requirementsText() : summaryText()) + '\nКонтактный телефон: ' + phone;
  }
  $('copyRequest').addEventListener('click', () => { const text = requestText(); if (text) copy(text); });
  $('sendMail').addEventListener('click', () => {
    const text = requestText();
    if (text) {
      track(requestMode === 'requirements' ? 'requirements_email_open' : 'kit_email_open');
      location.href = 'mailto:info@datts.ru?subject=' + encodeURIComponent(requestMode === 'requirements' ? 'Бесплатный подбор освещения DATTS' : 'Заявка с калькулятора DATTS') + '&body=' + encodeURIComponent(text);
    }
  });
  render();
})();
