// The standalone demo's sample conversation. In Gezel, the tutor's lines and
// grading come from the model the person chooses; here they are scripted, and
// every scene line goes through the same reply tool the live tutor calls, so
// corrections land in the phrasebook exactly as they do in the app.
window.demoChat = (function () {
  'use strict';
  var L = '(?<![\\p{L}])';
  var R = '(?![\\p{L}])';
  function has(pattern) { return new RegExp(L + '(?:' + pattern + ')', 'iu'); }

  // ── grading: the mistakes a level 1 to 2 learner makes most, quoted exactly ──
  var FEMININE = ['tostada', 'magdalena', 'leche', 'cuenta', 'mesa', 'manzana', 'naranja', 'fresa', 'uva', 'pera', 'maleta', 'habitación',
    'habitacion', 'calle', 'estación', 'estacion', 'farmacia', 'reserva', 'llave', 'tarjeta', 'pastilla', 'garganta', 'playa', 'ciudad', 'plaza'];
  var MASCULINE = ['café', 'cafe', 'té', 'cruasán', 'croissant', 'bocadillo', 'zumo', 'plátano', 'platano', 'kilo', 'museo', 'tren', 'billete',
    'pasaporte', 'vuelo', 'hotel', 'desayuno', 'jarabe', 'dolor', 'euro', 'limón', 'melocotón', 'parque', 'plato', 'ticket', 'cambio'];
  var YO = { quiere: 'quiero', tiene: 'tengo', necesita: 'necesito', puede: 'puedo', es: 'soy', 'está': 'estoy', va: 'voy', busca: 'busco', prefiere: 'prefiero', habla: 'hablo' };
  var ESTAR = { soy: 'estoy', eres: 'estás', es: 'está', somos: 'estamos', son: 'están' };
  var ACCENT = { cuanto: 'cuánto', cuanta: 'cuánta', cuantos: 'cuántos', cuantas: 'cuántas', donde: 'dónde', como: 'cómo', cuando: 'cuándo', cual: 'cuál', quien: 'quién' };

  function keepCase(from, to) {
    var c = from.charAt(0);
    return c !== c.toLowerCase() ? to.charAt(0).toUpperCase() + to.slice(1) : to;
  }
  function each(re, text, fn) { var m; re.lastIndex = 0; while ((m = re.exec(text))) fn(m); }

  function grade(text) {
    var found = [];
    function add(at, wrong, right, note) {
      if (!found.some(function (e) { return e.wrong.toLowerCase() === wrong.toLowerCase(); })) found.push({ at: at, wrong: wrong, right: right, note: note });
    }
    each(new RegExp(L + '(un|el)\\s+(' + FEMININE.join('|') + ')' + R, 'giu'), text, function (m) {
      add(m.index, m[0], keepCase(m[1], m[1].toLowerCase() === 'un' ? 'una' : 'la') + ' ' + m[2], m[2].toLowerCase() + ' is feminine');
    });
    each(new RegExp(L + '(una|la)\\s+(' + MASCULINE.join('|') + ')' + R, 'giu'), text, function (m) {
      add(m.index, m[0], keepCase(m[1], m[1].toLowerCase() === 'una' ? 'un' : 'el') + ' ' + m[2], m[2].toLowerCase() + ' is masculine');
    });
    each(new RegExp(L + '(soy|eres|es|somos|son)\\s+((?:cansad|enferm|content|nervios|ocupad|perdid|list)[oa]s?)' + R, 'giu'), text, function (m) {
      add(m.index, m[0], keepCase(m[1], ESTAR[m[1].toLowerCase()]) + ' ' + m[2], 'states use estar');
    });
    each(new RegExp(L + '(me|te|le|nos|les)\\s+gusta\\s+(las|los|mis|tus|sus)' + R, 'giu'), text, function (m) {
      add(m.index, m[0], m[1] + ' gustan ' + m[2], 'plural things use gustan');
    });
    each(new RegExp(L + '(yo)\\s+(quiere|tiene|necesita|puede|es|está|va|busca|prefiere|habla)' + R, 'giu'), text, function (m) {
      add(m.index, m[0], m[1] + ' ' + YO[m[2].toLowerCase()], 'with yo, use the yo form');
    });
    each(new RegExp(L + '(un|una)\\s+(otro|otra)' + R, 'giu'), text, function (m) {
      add(m.index, m[0], m[2], 'no article before otro');
    });
    each(new RegExp(L + '(a|de)\\s+el' + R, 'giu'), text, function (m) {
      var a = m[1].toLowerCase() === 'a';
      add(m.index, m[0], keepCase(m[1], a ? 'al' : 'del'), a ? 'a + el becomes al' : 'de + el becomes del');
    });
    // Question words carry an accent in a question.
    var start = 0;
    text.split(/(?<=[?.!])/).forEach(function (part) {
      if (part.indexOf('?') >= 0) {
        each(new RegExp(L + '(cuanto|cuanta|cuantos|cuantas|donde|como|cuando|cual|quien)' + R + '(\\s+\\p{L}+)?', 'giu'), part, function (m) {
          add(start + m.index, m[0], keepCase(m[1], ACCENT[m[1].toLowerCase()]) + (m[2] || ''), 'question words take an accent');
        });
        each(new RegExp(L + '(que)\\s+(hora|puedo|me recomienda|recomienda|tipo|hay|tienes|tiene)' + R, 'giu'), part, function (m) {
          add(start + m.index, m[0], keepCase(m[1], 'qué') + ' ' + m[2], 'question words take an accent');
        });
      }
      start += part.length;
    });
    return found.sort(function (a, b) { return a.at - b.at; }).slice(0, 3).map(function (e) { return { wrong: e.wrong, right: e.right, note: e.note }; });
  }

  var ES_WORDS = ['hola', 'quiero', 'quisiera', 'por', 'favor', 'gracias', 'un', 'una', 'el', 'la', 'los', 'las', 'de', 'y', 'es', 'está', 'estoy',
    'soy', 'me', 'tengo', 'para', 'con', 'buenos', 'buenas', 'días', 'sí', 'puedo', 'donde', 'como', 'cuanto', 'cuesta', 'vale', 'perdón', 'perdon',
    'mi', 'muy', 'bien', 'tiene', 'tienen', 'hay', 'al', 'del', 'en', 'yo', 'pago', 'llamo', 'que', 'qué', 'todo', 'recto', 'no'];
  var EN_WORDS = ['the', 'i', 'want', 'would', 'like', 'please', 'how', 'much', 'what', 'is', 'to', 'and', 'my', 'you', 'can', 'this', 'that', 'do',
    'does', 'where', 'are', 'it', 'have', 'hello', 'hi', 'thanks', 'thank', 'stop', 'end', 'scene', 'help', 'of', 'for', 'am', 'ready', 'let', 'lets'];
  function looksSpanish(text) {
    if (/[¿¡ñáéíóú]/i.test(text)) return true;
    var words = text.toLowerCase().match(/\p{L}+/gu) || [];
    var es = words.filter(function (w) { return ES_WORDS.indexOf(w) >= 0; }).length;
    var en = words.filter(function (w) { return EN_WORDS.indexOf(w) >= 0; }).length;
    return es > en;
  }

  // ── the scenes Lucía can play: an opener, the goal's steps in order, and a closing line ──
  var FRUITS = ['manzana', 'naranja', 'pl[aá]tano', 'fresa', 'uva', 'pera', 'melocot[oó]n', 'lim[oó]n', 'mango', 'sand[ií]a', 'mel[oó]n', 'cereza', 'kiwi'];
  var SCENES = {
    coffee: {
      label: 'café',
      opener: '¡Buenos días! ¿Qué te pongo?',
      steps: [
        { id: 'drink', test: has('caf[eé]|cortado|capuchino|té' + R + '|leche|zumo|agua|chocolate|descafeinado'), line: 'Marchando. ¿Quieres algo para comer?', nudge: '¿Y para beber? Tenemos café, té y zumo de naranja.', model: 'Quiero un café, por favor.' },
        { id: 'food', test: has('tostada|cruas[aá]n|croissant|magdalena|bocadillo|tarta|galleta|bollo|churro|pan' + R), line: '¡Muy bien! Las tostadas de hoy están riquísimas. ¿Algo más?', nudge: '¿Y para comer? Hay tostadas y cruasanes.', model: 'Y una tostada, por favor.' },
        { id: 'price', test: has('cu[aá]nt[oa]|precio|cuesta|pagar|la cuenta'), nudge: 'Muy bien. ¿Algo más, o te cobro?', model: '¿Cuánto es?' },
      ],
      more: '¿Algo más?',
      closing: 'Son cuatro euros con cincuenta. ¡Que aproveche!',
      samples: [
        { text: 'Hola, quiero un café con leche y un tostada, por favor.', covers: ['drink', 'food'] },
        { text: '¿Cuanto cuesta todo?', covers: ['price'] },
      ],
    },
    market: {
      label: 'market',
      opener: '¡Hola! Hoy tenemos fruta muy fresca. ¿Qué te pongo?',
      steps: [
        {
          id: 'fruit',
          test: function (text, mem) {
            FRUITS.forEach(function (f) { if (has(f).test(text) && mem.fruits.indexOf(f) < 0) mem.fruits.push(f); });
            return mem.fruits.length >= 3;
          },
          partial: 'Muy bien. ¿Qué más? Las fresas están muy dulces hoy.',
          line: '¡Estupendo! ¿Algo más?',
          nudge: '¿Qué fruta quieres? Tenemos manzanas, naranjas, fresas y uvas.',
          model: 'Quiero un kilo de manzanas, por favor.',
        },
        { id: 'price', test: has('cu[aá]nt[oa]|precio|cuesta'), line: 'Todo está a dos euros el kilo, y las fresas a cuatro. Son ocho euros.', nudge: '¿Algo más, o te digo el precio?', model: '¿Cuánto cuesta el kilo?' },
        { id: 'pay', test: has('pag[oa]|aqu[ií] tiene|tarjeta|efectivo|cobr'), nudge: 'Son ocho euros. ¿Pagas en efectivo o con tarjeta?', model: 'Pago con tarjeta.' },
      ],
      more: '¿Algo más?',
      closing: '¡Gracias! Aquí tienes el cambio. ¡Hasta la próxima!',
      samples: [
        { text: 'Quiero manzanas y una kilo de naranjas.', covers: ['fruit'] },
        { text: 'Y fresas, por favor. ¿Cuanto cuesta el kilo?', covers: ['fruit', 'price'] },
        { text: 'Pago con tarjeta, gracias.', covers: ['pay'] },
      ],
    },
    neighbor: {
      label: 'neighbor',
      opener: '¡Hola! Soy Marta, la nueva vecina del segundo. ¿Y tú?',
      steps: [
        { id: 'name', test: function (t) { return /(me llamo|mi nombre|encantad)/i.test(t) || /(?<![\p{L}])soy\s+(?!de(?![\p{L}]))\p{Lu}/u.test(t); }, line: '¡Encantada! ¿De dónde eres?', nudge: '¿Cómo te llamas?', model: 'Me llamo Sam.' },
        { id: 'from', test: has('soy de|vengo de|vivo en'), line: '¡Qué bien! Yo soy de Sevilla, pero vivo aquí desde el lunes.', nudge: '¿Y de dónde eres?', model: 'Soy de Chicago.' },
        { id: 'question', test: /\?/, nudge: 'Pues aquí estamos, vecinos. ¿Quieres preguntarme algo?', model: '¿Dónde trabajas?' },
      ],
      more: '¿Y qué más?',
      closing: 'Trabajo en una librería aquí cerca. ¡Nos vemos pronto!',
      samples: [
        { text: '¡Hola! Me llamo Sam. Soy de Chicago.', covers: ['name', 'from'] },
        { text: '¿Donde trabajas?', covers: ['question'] },
      ],
    },
    directions: {
      label: 'directions',
      opener: '¿Sí? ¿Te puedo ayudar?',
      steps: [
        { id: 'ask', test: has('museo|d[oó]nde|c[oó]mo (?:llego|voy)'), line: 'Claro. Sigue todo recto y gira a la izquierda en la plaza. El museo está al lado del parque.', nudge: '¿Adónde quieres ir?', model: '¿Cómo llego al museo?' },
        { id: 'repeat', test: has('recto|izquierda|derecha|plaza|parque'), nudge: '¿Me repites el camino, para estar seguros?', model: 'Todo recto y a la izquierda en la plaza.' },
      ],
      more: '¿Algo más?',
      closing: '¡Exacto! Son cinco minutos andando. ¡Que disfrutes del museo!',
      samples: [
        { text: 'Perdón, ¿como llego a el museo?', covers: ['ask'] },
        { text: 'Todo recto y a la izquierda en la plaza. ¡Gracias!', covers: ['repeat'] },
      ],
    },
    pharmacy: {
      label: 'pharmacy',
      opener: 'Buenas tardes. ¿En qué te puedo ayudar?',
      steps: [
        { id: 'feel', test: has('dolor|duele|garganta|tos' + R + '|fiebre|enferm|resfriad|mal' + R), line: 'Vaya, lo siento. Tenemos varias cosas para eso.', nudge: '¿Qué te pasa?', model: 'Me duele la garganta.' },
        { id: 'what', test: has('qu[eé] (?:puedo )?tomar|recomienda|medicina|medicamento|pastilla|jarabe|qu[eé] puedo'), line: 'Te recomiendo este jarabe de miel. Es muy suave.', nudge: '¿Quieres que te recomiende algo?', model: '¿Qué puedo tomar?' },
        { id: 'often', test: has('cada cu[aá]nto|cu[aá]ntas veces|al d[ií]a|cu[aá]ndo'), nudge: '¿Tienes alguna pregunta sobre cómo tomarlo?', model: '¿Cuántas veces al día?' },
      ],
      more: '¿Algo más?',
      closing: 'Una cucharada tres veces al día, después de comer. ¡Que te mejores!',
      samples: [
        { text: 'Hola, soy enfermo y me duele la garganta.', covers: ['feel'] },
        { text: '¿Que puedo tomar?', covers: ['what'] },
        { text: '¿Cuantas veces al día?', covers: ['often'] },
      ],
    },
    luggage: {
      label: 'lost luggage',
      opener: 'Buenos días. ¿En qué le puedo ayudar?',
      steps: [
        { id: 'report', test: has('maleta|equipaje|perd|no est[aá]|no lleg|no encuentro'), line: 'Lo siento mucho. ¿Cómo es la maleta?', nudge: '¿Qué ha pasado?', model: 'Mi maleta no ha llegado.' },
        { id: 'describe', test: has('grande|pequeñ|azul|roj|negr|verde|gris|marr[oó]n|rueda|color'), line: 'Gracias. ¿Dónde se aloja?', nudge: '¿Me la puede describir? ¿De qué color es?', model: 'Es una maleta azul y grande.' },
        { id: 'address', test: has('hotel|calle|direcci[oó]n|avenida|n[uú]mero'), nudge: '¿Y dónde se aloja?', model: 'Estoy en el Hotel Sol.' },
      ],
      more: '¿Algo más?',
      closing: 'Perfecto. Se la llevamos al hotel mañana por la mañana.',
      samples: [
        { text: 'No encuentro mi maleta. Es un maleta azul y grande.', covers: ['report', 'describe'] },
        { text: 'Estoy en el Hotel Sol, en la calle Mayor, 12.', covers: ['address'] },
      ],
    },
    restaurant: {
      label: 'restaurant',
      opener: 'Restaurante La Huerta, ¿dígame?',
      steps: [
        { id: 'book', test: has('mesa|reserv'), line: '¡Claro! ¿Para cuántas personas y qué día?', nudge: '¿Quiere hacer una reserva?', model: 'Quiero reservar una mesa.' },
        { id: 'details', test: function (t) { return has('cuatro|4').test(t) && has('viernes').test(t); }, line: 'Muy bien: el viernes a las nueve, para cuatro. ¿Algo más?', nudge: '¿Para cuántas personas y qué día?', model: 'Para cuatro personas, el viernes.' },
        { id: 'veg', test: has('vegetarian|vegan|sin carne|verdura'), nudge: '¿Algo más?', model: '¿Tienen platos vegetarianos?' },
      ],
      more: '¿Algo más?',
      closing: 'Sí, tenemos una paella de verduras buenísima. ¡Hasta el viernes!',
      samples: [
        { text: 'Hola, quiero reservar un mesa para cuatro el viernes.', covers: ['book', 'details'] },
        { text: '¿Tienen algún plato vegetariano?', covers: ['veg'] },
      ],
    },
    hotel: {
      label: 'hotel',
      opener: 'Buenas noches, bienvenido. ¿Tiene una reserva?',
      steps: [
        { id: 'checkin', test: has('reserva|me llamo|a nombre|mi nombre'), line: 'Perfecto, aquí está. Habitación 214.', nudge: '¿A nombre de quién está la reserva?', model: 'Tengo una reserva a nombre de Sam.' },
        { id: 'breakfast', test: has('desayuno'), line: 'El desayuno es de siete a diez, en el comedor.', nudge: '¿Tiene alguna pregunta?', model: '¿A qué hora es el desayuno?' },
        { id: 'quiet', test: has('tranquil|silencio|ruido'), nudge: '¿Algo más?', model: '¿Puede darme una habitación tranquila?' },
      ],
      more: '¿Algo más?',
      closing: 'Claro, le doy una habitación interior, muy tranquila. ¡Que descanse!',
      samples: [
        { text: 'Buenas noches. Tengo una reserva a nombre de Sam.', covers: ['checkin'] },
        { text: '¿A que hora es el desayuno?', covers: ['breakfast'] },
        { text: '¿Puede darme un habitación tranquila?', covers: ['quiet'] },
      ],
    },
    doctor: {
      label: 'doctor',
      opener: 'Buenos días. ¿Qué te ha pasado?',
      steps: [
        { id: 'what', test: has('tobillo|me ca[ií]|torc|pie' + R + '|duele'), line: 'Vaya. ¿Te duele mucho al caminar?', nudge: '¿Dónde te duele?', model: 'Me duele el tobillo.' },
        { id: 'answer', test: has('s[ií]' + R + '|no' + R + '|poco|mucho|bastante'), line: 'Es un esguince leve. Reposo, hielo y el pie en alto durante tres días.', nudge: '¿Te duele al caminar?', model: 'Sí, un poco.' },
        { id: 'understand', test: has('reposo|hielo|entiendo|vale|de acuerdo|gracias'), nudge: '¿Lo has entendido todo?', model: 'Vale, reposo y hielo.' },
      ],
      more: '¿Alguna pregunta más?',
      closing: 'Muy bien. Si no mejora, vuelve la semana que viene.',
      samples: [
        { text: 'Me caí y me duele el tobillo.', covers: ['what'] },
        { text: 'Sí, un poco cuando camino.', covers: ['answer'] },
        { text: 'Vale, reposo y hielo. ¡Gracias!', covers: ['understand'] },
      ],
    },
    return: {
      label: 'returns',
      opener: 'Hola, ¿en qué te puedo ayudar?',
      steps: [
        { id: 'problem', test: has('auricular|no funciona|roto|rota|problema'), line: '¡Vaya! ¿Tienes el ticket de compra?', nudge: '¿Qué le pasa al producto?', model: 'Mis auriculares no funcionan.' },
        { id: 'ticket', test: has('ticket|recibo|factura|aqu[ií] (?:lo )?tiene|s[ií]' + R), line: 'Perfecto. ¿Prefieres un reembolso o un cambio?', nudge: '¿Tienes el ticket?', model: 'Sí, aquí tiene el ticket.' },
        { id: 'choice', test: has('reembolso|cambio|devoluci[oó]n|dinero|cambiar'), nudge: '¿Prefieres un reembolso o un cambio?', model: 'Prefiero un cambio, por favor.' },
      ],
      more: '¿Algo más?',
      closing: 'Hecho. Aquí tienes. ¡Perdona las molestias!',
      samples: [
        { text: 'Hola. Mis auriculares no funcionan.', covers: ['problem'] },
        { text: 'Sí, aquí tiene el ticket.', covers: ['ticket'] },
        { text: 'Prefiero un cambio, por favor.', covers: ['choice'] },
      ],
    },
  };
  var ASKS = {
    coffee: /caf[eé]|coffee|barista/i, market: /market|mercado|fruit|fruta/i, neighbor: /neighbou?r|vecin/i,
    directions: /direction|museum|museo/i, pharmacy: /pharmac|farmacia/i, luggage: /luggage|suitcase|maleta|airport/i,
    restaurant: /restaurant|book(ing)? a table|mesa/i, hotel: /hotel/i, doctor: /doctor|m[eé]dico|ankle/i, return: /return|refund|headphones/i,
  };
  var IDLE = ['How am I doing?', 'Let’s play the café scene', 'Am I ready for level 3?', 'Help me with my due corrections'];
  var memory = { key: '', hit: {}, fruits: [] };

  function state(ctx) {
    return Promise.all([ctx.read('progress.json'), ctx.read('reviews.json'), ctx.read('scenarios.json')]).then(function (v) {
      var p = v[0] || {};
      return { progress: p, reviews: (v[1] && v[1].items) || [], scenarios: (v[2] && v[2].scenarios) || [], scene: p.scene && p.scene.status === 'active' ? p.scene : null };
    });
  }
  function dueAt(card) { return card.lastSeenAt ? Date.parse(card.lastSeenAt) + ({ 1: 1, 2: 3, 3: 7 }[card.box] || 1) * 86400000 : 0; }
  function due(s) { return s.reviews.filter(function (c) { return dueAt(c) <= Date.now(); }).sort(function (a, b) { return a.box - b.box || dueAt(a) - dueAt(b); }); }
  function count(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function spell(n) { return ['no', 'one', 'two', 'three', 'four', 'five', 'six'][n] || String(n); }
  function sceneId(s) {
    var found = s.scenarios.find(function (x) { return s.scene && x.title === s.scene.title; });
    return found ? found.id : '';
  }
  function scriptFor(s) { return SCENES[sceneId(s)] || null; }
  function recall(s) {
    var key = s.scene ? s.scene.title + '|' + (s.scene.startedAt || '') : '';
    if (memory.key !== key) memory = { key: key, hit: {}, fruits: [] };
    return memory;
  }
  function samplesFor(script, mem) {
    if (!script) return [];
    return script.samples.filter(function (sample) { return sample.covers.some(function (id) { return !mem.hit[id]; }); }).map(function (sample) { return sample.text; });
  }
  function idleKeys(extra) { return IDLE.concat(extra || []); }

  // One tutor turn in a scene, through reply: the line, the graded mistakes, and done once the goal is met.
  function sceneTurn(ctx, s, text) {
    var script = scriptFor(s), mem = recall(s), scene = s.scene;
    var errors = [], say, done = false;
    var lower = text.toLowerCase();
    var steps = script ? script.steps : [];
    var open = steps.filter(function (step) { return !mem.hit[step.id]; });
    if (/\b(end|stop|quit|finish)\b/.test(lower) && /\b(scene|this|now)\b/.test(lower)) {
      say = '¡Claro! Pulsa End scene en la página cuando quieras terminar. Si no, seguimos.';
    } else if (!script) {
      errors = grade(text);
      say = '¡Muy bien! Sigue, por favor.';
    } else if (!looksSpanish(text)) {
      say = open.length ? 'En español, por ejemplo: «' + open[0].model + '» ¡Inténtalo!' : script.more;
    } else {
      errors = grade(text);
      var fresh = [], blocked = false, grew = mem.fruits.length;
      steps.forEach(function (step) {
        if (mem.hit[step.id] || blocked) return;
        var test = step.test;
        if (typeof test === 'function' ? test(text, mem) : test.test(text)) {
          mem.hit[step.id] = true;
          fresh.push(step);
        } else blocked = true;
      });
      grew = mem.fruits.length > grew;
      var all = steps.every(function (step) { return mem.hit[step.id]; });
      if (all && scene.turns + 1 >= 3) {
        say = script.closing;
        done = true;
      } else if (all) {
        say = script.more;
      } else if (fresh.length) {
        say = fresh[fresh.length - 1].line;
      } else {
        var next = steps.find(function (step) { return !mem.hit[step.id]; });
        say = next.partial && grew ? next.partial : next.nudge;
      }
    }
    var summary = errors.length ? count(errors.length, 'correction') : 'In character';
    return ctx.invoke('reply', { say: say, errors: errors, done: done }, summary).then(function (out) {
      var finished = out && out.status === 'done';
      return {
        reply: (out && out.display) || say,
        suggestions: finished ? idleKeys(nextScene(s, sceneId(s))) : samplesFor(script, mem),
      };
    });
  }

  // After a scene, offer the next open one in the page's order.
  function nextScene(s, finishedId) {
    var level = s.progress.level || 1;
    var open = s.scenarios.filter(function (x) { return x.level <= level && SCENES[x.id]; });
    var at = open.findIndex(function (x) { return x.id === finishedId; });
    var pick = open.length > 1 ? open[(at + 1) % open.length] : null;
    return pick && pick.id !== finishedId ? ['Let’s do the ' + SCENES[pick.id].label + ' scene next'] : [];
  }

  function opening(ctx, s) {
    var script = scriptFor(s), mem = recall(s);
    var say = script ? script.opener : '¡Hola! Empezamos cuando quieras.';
    return ctx.invoke('reply', { say: say, errors: [] }, 'Opening line').then(function (out) {
      return { reply: (out && out.display) || say, suggestions: samplesFor(script, mem) };
    });
  }

  function begin(ctx, s, id) {
    var target = s.scenarios.find(function (x) { return x.id === id; });
    if (!target) return null;
    if (target.level > (s.progress.level || 1)) {
      return 'That one opens at level ' + target.level + '. You’re on level ' + s.progress.level + '; ask me if you’re ready to move up.';
    }
    return ctx.invoke('begin_scene', { scenario: id }, target.title).then(function () {
      return state(ctx);
    }).then(function (next) { return opening(ctx, next); });
  }

  function progressReply(ctx) {
    return ctx.invoke('practice_state', {}, 'Level, streak and reviews').then(function () { return state(ctx); }).then(function (s) {
      var p = s.progress, list = due(s);
      var head = '¡Vas muy bien! You’re on level ' + p.level + ' with a ' + p.streak + '-day streak, and ' + count(p.sessions || 0, 'scene') + ' played.';
      if (!list.length) return head + ' Nothing is due for review today.';
      var named = list.slice(0, 2).map(function (c) { return '**' + c.right + '** (not “' + c.wrong + '”)'; }).join(' and ');
      return head + ' ' + (list.length === 1 ? 'One correction is' : spell(list.length).charAt(0).toUpperCase() + spell(list.length).slice(1) + ' corrections are') +
        ' due today: ' + named + '. They’re waiting under Review & phrasebook.';
    });
  }

  function advance(ctx, s) {
    var p = s.progress, top = s.scenarios.reduce(function (m, x) { return Math.max(m, x.level); }, 1);
    if (p.level >= top) return 'You’re on level ' + p.level + ' already, the top of these scenes. Keep the streak going and play the ones you like best.';
    var recent = (p.history || []).slice(-3);
    if (recent.length < 2) return 'Play a couple more scenes first, so I can see how this level feels for you.';
    var turns = recent.reduce(function (n, h) { return n + h.turns; }, 0), slips = recent.reduce(function (n, h) { return n + h.mistakes; }, 0);
    var every = slips ? Math.round(turns / slips) : 0;
    if (slips && turns / slips < 3) {
      return 'Almost. Your last ' + recent.length + ' scenes had a correction about every ' + every + ' turns. A couple more at level ' + p.level + ' and you’ll be there.';
    }
    return ctx.invoke('advance_level', { note: 'comfortable at level ' + p.level }, 'Level ' + (p.level + 1)).then(function () { return state(ctx); }).then(function (next) {
      var opened = next.scenarios.filter(function (x) { return x.level === next.progress.level; }).map(function (x) { return '**' + x.title + '**'; });
      return 'Yes. ' + (slips ? 'Your last ' + recent.length + ' scenes had only one correction every ' + every + ' turns' : 'Your last scenes had no corrections at all') +
        ', so level ' + next.progress.level + ' it is.' + (opened.length ? ' New scenes are open: ' + opened.join(' and ') + '.' : '');
    });
  }

  function drill(s) {
    var list = due(s);
    if (!list.length) return 'Nothing is due today. Play a scene and the new corrections will come back tomorrow.';
    var phrases = list.slice(0, 2).map(function (c) { return '**' + c.right + '**'; });
    return {
      reply: 'Let’s do it in context. Write one sentence that uses ' + phrases.join(' or ') + ', and I’ll check it.',
      suggestions: idleKeys(['Estoy cansado, pero quiero un café.']),
    };
  }

  function chat(s, text) {
    var errors = grade(text);
    var used = due(s).filter(function (c) { return text.toLowerCase().indexOf(c.right.toLowerCase()) >= 0; });
    if (!errors.length) {
      return '¡Perfecto! That’s correct.' + (used.length
        ? ' You used ' + used.map(function (c) { return '**' + c.right + '**'; }).join(' and ') + ' right; mark ' + (used.length === 1 ? 'it' : 'them') + ' Got it when ' + (used.length === 1 ? 'it comes' : 'they come') + ' up for review.'
        : ' Want to use it in a scene? Pick one on the page, or ask me to start one.');
    }
    return '¡Casi! Corrections: ' + errors.map(function (e) { return '"' + e.wrong + '" → "' + e.right + '" (' + e.note + ')'; }).join('; ') +
      '. In a scene, I save corrections like these to your phrasebook.';
  }

  return {
    name: 'Lucía',
    role: 'Language Trainer',
    greeting: '¡Hola! I’m Lucía, your Spanish tutor. You’re on a 4-day streak, and two corrections are due today. Pick a scene on the page and I’ll play the other person, or ask me to start one.',
    suggestions: IDLE,
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      return state(ctx).then(function (s) {
        // In Gezel, a message during a scene is always answered in character through reply.
        if (s.scene) return sceneTurn(ctx, s, text);
        var wants = Object.keys(ASKS).find(function (id) { return ASKS[id].test(lower); });
        if (wants && /\b(play|start|let|practice|scene|do|try|next)\b|empe[zc]|vamos/.test(lower)) return begin(ctx, s, wants);
        if (/\b(ready|next level|level up|harder|challenge|level \d)\b/.test(lower)) return advance(ctx, s);
        if (/\b(how am i|progress|streak|doing|my level)\b/.test(lower)) return progressReply(ctx);
        if (/\b(due|review|corrections?|phrasebook|mistakes?)\b/.test(lower)) return drill(s);
        if (looksSpanish(text)) return chat(s, text);
        return null;
      });
    },
    reactions: {
      // The live reaction: the tutor opens a scene the person started on the page.
      start_scene: function (input, output, ctx) {
        return state(ctx).then(function (s) { return s.scene ? opening(ctx, s) : null; });
      },
      // No reaction in Gezel either; this only retires the scene's sample lines.
      end_scene: function () { return { reply: '', suggestions: idleKeys() }; },
    },
  };
})();
