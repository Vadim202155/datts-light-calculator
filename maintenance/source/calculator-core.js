function createCalculator(catalog) {
  const catalogUrl = 'https://datts.ru/catalog/';
  const flushUrl = 'https://datts.ru/catalog/vstraivaemye_svetilniki/';
  const gxUrl = 'https://www.datts.ru/catalog/vstroennye_svetilniki_s_lampami/';
  const trackUrl = 'https://datts.ru/catalog/trekovye_svetilniki_i_komplektuyushie/';
  const trackLineUrl = trackUrl + 'linejnye_svetilniki_2/';
  const magneticUrl = catalogUrl + 'magnetic_track_system/datts_magnetic_48V/';
  const stripUrl = catalogUrl + 'svetodiodnye_lenty_i_komplektuyushchie/';
  const roomTypes = {
    living: { name: 'Гостиная', lux: 200, cct: 3000 },
    bedroom: { name: 'Спальня', lux: 200, cct: 2700 },
    kitchen: { name: 'Кухня', lux: 200, cct: 4000 },
    bath: { name: 'Ванная', lux: 100, cct: 4000 },
    hall: { name: 'Коридор', lux: 100, cct: 3000 },
    office: { name: 'Кабинет', lux: 200, cct: 4000 }
  };
  const beamDefaults = { general: 90, work: 60, accent: 30 };
  const families = {
    custom: { name: 'Свой светильник', series: [] },
    recessed: { name: 'Встраиваемые', series: [
      ['h4', 'GX53-H4', 'recessed', gxUrl + 'gx53_h4_2/'],
      ['h2', 'GX53-H2', 'recessed', gxUrl + 'gx53_h2_2/'],
      ['slim53', 'SLIMSTAR GX53', 'recessed', flushUrl],
      ['slim10', 'SLIMSTAR GU10', 'recessed', flushUrl],
      ['bwRecessed53', 'B&W GX53', 'recessed', flushUrl],
      ['panel', 'LED-панели', 'panels', catalogUrl + 'vstroennye_svetilniki_s_integrirovannym_led/']
    ] },
    surface: { name: 'Накладные', series: [
      ['bwSurface53', 'B&W GX53', 'surface', catalogUrl],
      ['bwSurface10', 'B&W GU10', 'surface', catalogUrl],
      ['surfaceLed', 'LED Flash', 'surface-led', catalogUrl],
      ['surfacePlate', 'LED Plate', 'surface-led', catalogUrl + 'plate24', 'Для LED Plate в справочнике отсутствуют артикулы.']
    ] },
    track220: { name: 'Трековая система 220 В', series: [
      ['track53', 'TrackSpot GX53', 'track220', trackUrl],
      ['track10', 'TrackSpot GU10', 'track220', trackUrl],
      ['trackLine', 'TrackLine', 'trackline', trackLineUrl, 'Световой поток TrackLine не подтверждён.'],
    ] },
    magnetic: { name: 'Магнитная система 48 В', series: [
      ['magLine', 'Линейные светильники', 'magnetic', magneticUrl],
      ['magSpot', 'Магнитные споты', 'magnetic-spot', magneticUrl],
      ['magLens', 'Линзованные светильники', 'magnetic-lens', magneticUrl]
    ] },
    strip: { name: 'LED-ленты', series: [
      ['strip12', 'SMD 12 В', 'strip', stripUrl + 'about/smd12'],
      ['strip24', 'SMD 24 В', 'strip', stripUrl + 'about/smd24/'],
      ['strip48', 'SMD 48 В', 'strip', stripUrl + 'about/smd48/'],
      ['stripCob12', 'COB 12 В', 'strip-cob', stripUrl + 'svetodiodnaya_lenta_datts_cob/'],
      ['stripCob24', 'COB 24 В', 'strip-cob', stripUrl + 'svetodiodnaya_lenta_datts_cob/'],
      ['stripRgb', 'RGB / RGBW', 'strip', stripUrl + 'about/rgb/', 'Совместимость контроллера и ленты требует проверки.'],
      ['stripCct', 'CCT', 'strip', stripUrl + 'about/cct/', 'Совместимость контроллера и ленты требует проверки.']
    ] }
  };
  const products = catalog.products.filter(product => product.automatic);
  const lamps = products.filter(product => product.kind === 'lamp');
  const supplies = products.filter(product => product.kind === 'supply' && product.dc);
  const housingSeries = new Set(['h4', 'h2']);
  const mounting = { recessed: 'Встраиваемый', surface: 'Накладной', track220: 'Однофазный трек 220 В',
    magnetic: 'Магнитный трек 48 В', strip: 'Лента' };
  const series = Object.fromEntries(Object.entries(families).flatMap(([family, info]) =>
    info.series.map(([id, name, icon, url, reason]) => [id, { id, name, icon, url, reason, family }])
  ));
  const number = value => value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
  const etaValid = value => value > 0 && value <= 1;
  const ceil = value => Math.ceil(value - 1e-10);
  const priced = value => Number.isFinite(value) && value > 0;
  const safePrice = row => priced(row.item.price) ? row.item.price * row.billQty : null;
  const targetLux = room => room.emode === 'custom' ? number(room.manualE) : room.emode === 'work' ? 400 : roomTypes[room.type].lux;

  function compatible(housing, lamp, family) {
    if (housing.socket !== lamp.socket || !(lamp.watts > 0 && lamp.watts <= housing.maxWatts)) return false;
    if (!(lamp.voltageMin <= 220 && lamp.voltageMax >= 240)) return false;
    if (housing.voltageMin == null || housing.voltageMax == null) {
      // The DATTS SLIMSTAR GX53 housing has a standard mains GX53 socket. The lamp determines its input range.
      return housing.seriesId === 'slim53' && family === 'recessed';
    }
    return housing.voltageMin <= 220 && housing.voltageMax >= 240;
  }

  function choicesFor(seriesId, room) {
    const info = series[seriesId];
    if (!info || (room.type === 'bath' && room.bathZone !== 'outside')) return [];
    const records = products.filter(product => product.seriesId === seriesId && product.mount === mounting[info.family]);
    const acceptsIP = product => room.type !== 'bath' || Number(product.ip) >= 20;
    const sources = records.filter(product => product.kind !== 'housing' && acceptsIP(product));
    const housings = records.filter(product => product.kind === 'housing' && acceptsIP(product));
    return [
      ...sources.filter(product => product.lumens > 0 && product.watts > 0
        && (info.family !== 'magnetic' || product.voltage === 48)
        && (info.family !== 'strip' || product.voltage > 0)).map(product => ({ product, housings: [] })),
      ...lamps.filter(acceptsIP).map(product => ({
        product,
        housings: housings.filter(housing => compatible(housing, product, info.family))
          .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.sku.localeCompare(b.sku))
      })).filter(option => option.housings.length)
    ];
  }

  function available(family, room) {
    return families[family].series.map(([id]) => ({ ...series[id], enabled: choicesFor(id, room).length > 0 }));
  }

  function selection(fixture, room) {
    const defaultAngle = fixture.family === 'strip' ? null : beamDefaults[fixture.role ?? 'general'];
    return {
      cct: fixture.cct == null ? roomTypes[room.type].cct : number(fixture.cct),
      angle: fixture.angle == null ? number(room.angle) ?? defaultAngle : number(fixture.angle)
    };
  }

  function catalogPreset(fixture, room, selectedSeries) {
    const target = selection({ ...fixture, cct: null, angle: null }, room);
    const ids = selectedSeries ? [selectedSeries] : families[fixture.family].series.map(([id]) => id);
    const candidates = ids.flatMap(id => choicesFor(id, room).map(({ product }) => {
      const cct = number(product.cct);
      const min = number(product.angleMin);
      const max = number(product.angleMax);
      const angle = number(product.angle) ?? (min != null && max != null
        ? Math.max(min, Math.min(max, target.angle ?? min)) : null);
      const temperatureDistance = cct == null ? Infinity : Math.abs(cct - target.cct);
      const beamDistance = target.angle == null ? 0 : angle == null ? Infinity : Math.abs(angle - target.angle);
      return { series: id, cct, angle, temperatureDistance, beamDistance };
    }));
    candidates.sort((a, b) => a.temperatureDistance - b.temperatureDistance || a.beamDistance - b.beamDistance);
    const preset = candidates[0];
    return preset ? { series: preset.series, cct: preset.cct ?? '', angle: preset.angle ?? '' } : null;
  }

  function matchingChoices(fixture, room, seriesId = fixture.series) {
    const { cct, angle } = selection(fixture, room);
    return choicesFor(seriesId, room).filter(({ product }) =>
      (cct == null || number(product.cct) === cct) &&
      (angle == null || matchesAngle(product, angle)));
  }

  function variantOptions(fixture, room) {
    const own = fixture.family === 'custom';
    if (own && (fixture.catalogFallback || fixture.role === 'accent' || room.type === 'bath')) return [];
    const ids = own ? Object.values(series).filter(s => s.family !== 'strip').map(s => s.id)
      : fixture.seriesPinned || (fixture.model && fixture.model !== 'auto') ? [fixture.series]
      : families[fixture.family].series.map(([id]) => id);
    return ids.flatMap(id => matchingChoices(fixture, room, id).flatMap(option => {
      if (!own && fixture.model && fixture.model !== 'auto' && option.product.sku !== fixture.model) return [];
      const shells = option.housings.length ? option.housings : [null];
      return shells.map(shell => ({ ...option, seriesId: id, explicitHousing: Boolean(shell),
        housings: shell ? [shell] : [], key: [id, option.product.sku, shell?.sku || ''].join('|') }));
    }));
  }

  function chooseModel(fixture, room, lumens) {
    if (fixture.variantKey) {
      const variant = variantOptions(fixture, room).find(o => o.key === fixture.variantKey);
      if (variant) return variant;
    }
    const options = matchingChoices(fixture, room);
    if (fixture.model && fixture.model !== 'auto') {
      return options.find(option => option.product.sku === fixture.model) || null;
    }
    const cost = option => {
      const p = option.product;
      const housingPrice = option.housings.length ? option.housings[0].price : 0;
      return priced(p.price) && (priced(housingPrice) || !option.housings.length)
        ? ceil(lumens / p.lumens) * (p.price + housingPrice) : Infinity;
    };
    return options.sort((a, b) => cost(a) - cost(b) || a.product.sku.localeCompare(b.product.sku))[0] || null;
  }

  function matchesAngle(product, requested) {
    const fixed = number(product.angle);
    if (fixed != null) return fixed === requested;
    const min = number(product.angleMin);
    const max = number(product.angleMax);
    return min != null && max != null && min <= requested && requested <= max;
  }

  function geometricCoverage(height, plane, angle) {
    if (!(height > plane && plane >= 0 && angle > 0 && angle < 180)) return null;
    return 2 * (height - plane) * Math.tan(angle * Math.PI / 360);
  }

  function line(item, qty, icon, billQty = qty, extra = {}) {
    return { item, qty, billQty, icon, unit: item.unit || 'шт.', ...extra };
  }

  function powerSupply(voltage, load) {
    const required = load * 1.2;
    if (!(voltage > 0 && required > 0 && Number.isFinite(required))) return { required };
    const item = supplies.filter(p => p.voltage === voltage && p.watts >= required - 1e-8)
      .sort((a, b) => a.watts - b.watts || (a.price ?? Infinity) - (b.price ?? Infinity))[0];
    return { item, required };
  }

  function productUnits(option, fixture, qty) {
    if (!(qty > 0) || !option) return { rows: [], missing: [], notes: [] };
    const info = series[option.seriesId || fixture.series];
    const p = option.product;
    const rows = [];
    const missing = [];
    const notes = [];
    if (option.housings.length) {
      const shell = option.housings[0];
      if (housingSeries.has(info.id) && !option.explicitHousing) {
        rows.push(line({ ...shell, sku: null, id: info.id, name: 'Корпус ' + info.name,
          url: info.url, urlKind: 'series' }, qty, info.icon, qty, {
          from: true, variants: option.housings, description: 'Отделка корпуса выбирается в каталоге DATTS.'
        }));
      } else {
        rows.push(line(shell, qty, info.icon));
      }
    }
    if (p.kind === 'strip') {
      const roll = p.rollMetres;
      const rolls = roll ? ceil(qty / roll) : null;
      // DATTS publishes the strip price per metre. The estimate allows for whole reels where the SKU defines a reel.
      rows.push(line(p, qty, info.icon, rolls ? rolls * roll : qty, { rolls }));
      const supply = powerSupply(p.voltage, p.watts * qty);
      if (supply.item) rows.push(line(supply.item, 1, 'power'));
      else missing.push('Блок питания ' + p.voltage + ' В с расчётным запасом');
      notes.push('На ' + qty.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) +
        ' м требуется не менее ' + Math.ceil(supply.required) + ' Вт с запасом 20 %.');
      if (rolls > 1) missing.push('Схема подключения участков ленты');
      if (!p.cutMetres) missing.push('Шаг резки');
      if (!roll) missing.push('Упаковка ленты');
      if (p.controllerRequired) missing.push('Совместимый контроллер');
    } else {
      const lampIcon = { GX53: 'gx53', GU10: 'gu10' };
      const productIcon = p.kind === 'lamp' ? lampIcon[p.socket] || 'custom'
        : info.id === 'panel' && /круг|round/iu.test(p.name) ? 'panel-round' : info.icon;
      rows.push(line(p, qty, productIcon));
    }
    if (info.family === 'track220') notes.push('Шинопровод 220 В, ввод питания и соединители подбираются по схеме монтажа.');
    if (info.family === 'magnetic') {
      const supply = powerSupply(48, p.watts * qty);
      if (supply.item) rows.push(line(supply.item, 1, 'power'));
      else missing.push('Блок питания 48 В с расчётным запасом');
      notes.push('Магнитный профиль 48 В, ввод питания и соединители подбираются по схеме монтажа.');
    }
    return { rows, missing, notes };
  }

  function factFor(room, fixture, demand, auto) {
    const own = fixture.family === 'custom';
    const general = fixture.role !== 'accent';
    const option = own ? null : chooseModel(fixture, room, demand / room.eta);
    const p = option?.product;
    const lm = own ? number(fixture.lumens) : p?.lumens;
    const strip = fixture.family === 'strip';
    const input = number(fixture.amount);
    const problem = own && !(lm > 0) ? 'Введите световой поток больше нуля.'
      : !own && !p ? (room.type === 'bath' ? 'Укажите условия монтажа. Для выбранной зоны нет подтверждённой модели.'
        : 'Выберите доступную серию и совместимую модель.')
      : !auto && !(input >= 0 && input != null && (strip || Number.isInteger(input))) ? 'Укажите ' + (strip ? 'длину' : 'целое количество') + '.'
      : null;
    const step = strip ? (p?.cutMetres || .1) : 1;
    const qty = problem ? 0 : auto ? +(ceil(demand / (lm * room.eta * step)) * step).toFixed(6) : input;
    const { angle } = selection(fixture, room);
    const knownAngle = p?.angle ?? (p && angle != null && matchesAngle(p, angle) ? angle : null);
    const geometry = !strip && geometricCoverage(number(room.height), number(room.plane) ?? 0.8,
      own ? angle : knownAngle);
    const kit = productUnits(option, fixture, qty);
    return { fixture, own, general, option, qty, strip, lm, geometry, problem, ...kit,
      contribution: problem || !general ? 0 : qty * lm * room.eta };
  }

  function calculateRoom(room) {
    const lux = targetLux(room);
    const demand = number(room.area) * lux * number(room.k);
    if (!(demand > 0 && number(room.area) > 0 && lux > 0 && number(room.k) >= 1 && etaValid(number(room.eta)))) {
      return { room, lux, demand: 0, facts: [], contributed: 0, pieces: 0, metres: 0,
        error: 'Проверьте площадь, освещённость, K (от 1) и η (больше 0, до 1).' };
    }
    const auto = room.fixtures.find(f => f.role !== 'accent' && f.amount === 'auto');
    const facts = new Map(room.fixtures.filter(f => f !== auto)
      .map(f => [f.id, factFor(room, f, demand, false)]));
    const fixed = [...facts.values()].reduce((sum, fact) => sum + fact.contribution, 0);
    if (auto) {
      let remaining = Math.max(0, demand - fixed);
      if (remaining < 1e-8) remaining = 0;
      facts.set(auto.id, factFor(room, auto, remaining, true));
    }
    const ordered = room.fixtures.map(f => facts.get(f.id));
    return { room, lux, demand, facts: ordered,
      contributed: ordered.reduce((sum, fact) => sum + fact.contribution, 0),
      pieces: ordered.reduce((sum, fact) => sum + (fact.strip ? 0 : fact.qty), 0),
      metres: ordered.reduce((sum, fact) => sum + (fact.strip ? fact.qty : 0), 0) };
  }

  function alternate(calculation, fact) {
    if (!fact.own || fact.fixture.catalogFallback || !fact.qty || !fact.general || calculation.room.type === 'bath') return null;
    const room = calculation.room;
    const target = fact.qty * fact.lm;
    if (fact.fixture.variantKey) {
      const option = variantOptions(fact.fixture, room).find(o => o.key === fact.fixture.variantKey);
      if (option) {
        const qty = ceil(target / option.product.lumens);
        return { option, qty, ...productUnits(option, { series: option.seriesId }, qty) };
      }
    }
    const preferred = room.type === 'kitchen' || room.type === 'office' ? 'panel' : 'h4';
    const ids = [preferred, ...families.magnetic.series.map(([id]) => id)];
    const match = ids.flatMap(id => matchingChoices(fact.fixture, room, id).map(option => ({ id, option })))
      .sort((a, b) => Math.abs(a.option.product.lumens - fact.lm) - Math.abs(b.option.product.lumens - fact.lm))[0];
    if (!match) return null;
    const qty = ceil(target / match.option.product.lumens);
    return { option: match.option, qty, ...productUnits(match.option, { series: match.id }, qty) };
  }

  function estimate(rows, missing = []) {
    let amount = 0;
    let pricedCount = 0;
    for (const row of rows) {
      const price = safePrice(row);
      if (price != null) {
        amount += price;
        pricedCount++;
      }
    }
    return { amount: pricedCount ? amount : null, partial: missing.length > 0 || pricedCount < rows.length,
      from: rows.some(row => row.from), missing: [...new Set(missing)] };
  }

  return { catalogUrl, roomTypes, families, series, available, choicesFor, selection, catalogPreset, matchingChoices, chooseModel, calculateRoom,
    alternate, variantOptions, estimate, geometricCoverage, powerSupply, number, safePrice };
}

if (typeof module !== 'undefined') module.exports = { createCalculator };
