// The standalone demo's sample conversation. In Gezel, the designer's replies
// come from the model the person chooses; here they are scripted, and every
// palette is saved through the same save_scheme tool the real designer calls.
window.demoChat = (function () {
  'use strict';
  var IDEAS = [
    { name: 'Harbor Fog', mood: 'calm', colors: ['#22313A', '#5E7380', '#A9B9BF', '#E3E7E3', '#F6F7F4'],
      note: 'slate ink, a gray-blue and sea glass on a cool white' },
    { name: 'Signal Orange', mood: 'bold', colors: ['#14161C', '#29335C', '#E4572E', '#F3A712', '#F4F1EA'],
      note: 'near-black and navy carrying a hot orange and a marigold' },
    { name: 'Clay Studio', mood: 'warm', colors: ['#3B2A22', '#A4532F', '#D9905F', '#EAD7C3', '#FBF6EF'],
      note: 'fired-clay browns and a terracotta on a soft cream' },
    { name: 'Night Garden', mood: 'dark', colors: ['#121A17', '#2F4A3A', '#6E8F5E', '#C9B37E', '#EFE9DA'],
      note: 'deep greens with a brass highlight, made for dark screens' },
  ];

  function rgb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function luminance(hex) {
    var c = rgb(hex).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    var x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function hsl(hex) {
    var c = rgb(hex).map(function (v) { return v / 255; });
    var max = Math.max.apply(null, c), min = Math.min.apply(null, c), l = (max + min) / 2, d = max - min, h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      h = max === c[0] ? ((c[1] - c[2]) / d) % 6 : max === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return [h, s, l];
  }
  function hex(h, s, l) {
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    var p = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return '#' + p.map(function (v) { return ('0' + Math.round((v + m) * 255).toString(16)).slice(-2); }).join('').toUpperCase();
  }
  var VARIANT = / \((warmer|cooler)\)$/;
  function isHex(c) { return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c); }
  function ratio(n) { return (Math.round(n * 10) / 10).toFixed(1) + ':1'; }
  function slug(text) { return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

  function schemes(ctx) {
    return ctx.read('schemes/index.json').then(function (doc) {
      return ((doc && doc.schemes) || []).map(function (s) {
        return { name: s.name || 'Untitled', colors: (s.colors || []).filter(isHex) };
      }).filter(function (s) { return s.colors.length >= 2; });
    });
  }
  // Darkest and lightest colors, the pair a page's body text and background would use.
  function ends(colors) {
    var sorted = colors.slice().sort(function (a, b) { return luminance(a) - luminance(b); });
    return { dark: sorted[0], light: sorted[sorted.length - 1], ratio: contrast(sorted[0], sorted[sorted.length - 1]) };
  }
  function textSafe(colors) {
    var light = ends(colors).light;
    return colors.filter(function (c) { return c !== light && contrast(c, light) >= 4.5; });
  }
  // The hue of a palette's colored members; near-grays carry no temperature.
  function warmth(colors) {
    var tinted = colors.map(hsl).filter(function (v) { return v[1] > 0.12 && v[2] > 0.08 && v[2] < 0.92; });
    if (!tinted.length) return 0;
    var score = tinted.reduce(function (sum, v) { return sum + Math.cos((v[0] - 30) * Math.PI / 180); }, 0);
    return score / tinted.length;
  }
  function named(list, text) {
    var lower = text.toLowerCase();
    var hits = list.filter(function (s) { return lower.indexOf(s.name.toLowerCase()) >= 0; });
    hits.sort(function (a, b) { return b.name.length - a.name.length; });
    return hits[0] || null;
  }

  // Saves through the designer's tool, then brings the saved card into view when the conversation sits beside the page.
  function save(ctx, name, colors, summary) {
    return ctx.invoke('save_scheme', { name: name, colors: colors }, summary).then(function (out) {
      setTimeout(function () {
        if (window.innerWidth <= 900) return;
        var card = Array.prototype.find.call(document.querySelectorAll('#grid .card'), function (node) {
          var label = node.querySelector('.name');
          return label && label.textContent === name;
        });
        if (!card) return;
        var box = card.getBoundingClientRect();
        if (box.top < 0 || box.bottom > window.innerHeight) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 220);
      return out;
    });
  }

  function readability(ctx) {
    return schemes(ctx).then(function (list) {
      if (!list.length) return 'There are no palettes on the wall yet. Ask me for a first direction and I’ll check it as I save it.';
      var rows = list.map(function (s) { return { s: s, e: ends(s.colors), safe: textSafe(s.colors) }; });
      rows.sort(function (a, b) { return b.e.ratio - a.e.ratio; });
      var weak = rows.filter(function (r) { return r.e.ratio < 4.5; });
      return 'Darkest color on lightest, the pair body text would use:\n\n' +
        rows.map(function (r) {
          return '- **' + r.s.name + '** ' + ratio(r.e.ratio) + ', with ' + r.safe.length + ' of ' + r.s.colors.length + ' colors dark enough for text on ' + r.e.light;
        }).join('\n') + '\n\n' +
        (weak.length
          ? weak.map(function (r) { return r.s.name; }).join(' and ') + ' fall short of 4.5:1, so keep body text off them and use them for large type and fills.'
          : '**' + rows[0].s.name + '** reads easiest. Everything clears 4.5:1 for body text, so the middle tones are free to be fills and accents.');
    });
  }

  function direction(ctx, mood) {
    return schemes(ctx).then(function (list) {
      var saved = list.map(function (s) { return slug(s.name); });
      var fresh = IDEAS.filter(function (idea) { return saved.indexOf(slug(idea.name)) < 0; });
      var idea = fresh.find(function (i) { return i.mood === mood; }) || fresh[0];
      if (!idea) return 'All four of my sample directions are already on the wall. Pick one to warm up or cool down, or give me hex colors to save.';
      return save(ctx, idea.name, idea.colors, idea.name + ', ' + idea.colors.length + ' colors').then(function () {
        var e = ends(idea.colors);
        var loud = idea.colors.filter(function (c) { var v = hsl(c); return v[1] > 0.55 && v[2] > 0.3 && v[2] < 0.75; })
          .sort(function (a, b) { return contrast(a, e.light) - contrast(b, e.light); })[0];
        return 'Saved **' + idea.name + '**: ' + idea.note + '. Its darkest color on its lightest holds ' + ratio(e.ratio) + ' for body text.' +
          (loud && contrast(loud, e.light) < 4.5 ? ' Keep ' + loud + ' to buttons and large type; on the light background it is only ' + ratio(contrast(loud, e.light)) + '.' : '');
      });
    });
  }

  function mixed(color, tint, amount) {
    var a = rgb(color), b = rgb(tint), lightness = hsl(color)[2];
    var out = '#' + a.map(function (v, i) { return ('0' + Math.round(v + (b[i] - v) * amount).toString(16)).slice(-2); }).join('');
    var v = hsl(out);
    return hex(v[0], v[1], lightness);
  }
  function and(names) {
    return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  // Warming or cooling mixes a little of one tint into every color and keeps each color's lightness.
  function shift(ctx, text, warmer) {
    return schemes(ctx).then(function (list) {
      var source = named(list, text);
      if (!source) {
        var pool = list.filter(function (s) { return !VARIANT.test(s.name); });
        pool.sort(function (a, b) { return warmer ? warmth(a.colors) - warmth(b.colors) : warmth(b.colors) - warmth(a.colors); });
        source = pool[0] || list[0];
      }
      if (!source) return 'There’s nothing on the wall to adjust yet. Ask me for a first direction.';
      var base = source.name.replace(VARIANT, '');
      var colors = source.colors.map(function (c) { return mixed(c, warmer ? '#C8662F' : '#3B6FA8', 0.16); });
      var name = base + (warmer ? ' (warmer)' : ' (cooler)');
      var before = ends(source.colors).ratio, after = ends(colors).ratio;
      return save(ctx, name, colors, name).then(function () {
        return 'Saved **' + name + '** next to ' + base + ' so you can compare. Every color has a little ' + (warmer ? 'terracotta' : 'blue') +
          ' mixed in and keeps its lightness, so the steps between them feel the same and text contrast ' +
          (Math.abs(before - after) < 0.3 ? 'stays about the same at ' + ratio(after) + '.' : 'moves from ' + ratio(before) + ' to ' + ratio(after) + '.');
      });
    });
  }

  function shortlist(ctx) {
    return schemes(ctx).then(function (list) {
      if (list.length < 2) return 'There’s only ' + (list.length ? 'one palette' : 'nothing') + ' on the wall so far. Ask me for another direction so there’s something to choose between.';
      var ranked = list.slice().sort(function (a, b) { return ends(b.colors).ratio - ends(a.colors).ratio; });
      var first = ranked[0];
      var second = list.filter(function (s) { return s !== first; }).sort(function (a, b) {
        return Math.abs(warmth(b.colors) - warmth(first.colors)) - Math.abs(warmth(a.colors) - warmth(first.colors));
      })[0];
      var rest = list.filter(function (s) { return s !== first && s !== second; });
      var temp = function (s) { var w = warmth(s.colors); return w > 0.35 ? 'warm' : w < -0.2 ? 'cool' : 'neutral'; };
      return 'I’d take **' + first.name + '** and **' + second.name + '** forward. ' + first.name + ' has the strongest text contrast on the wall (' + ratio(ends(first.colors).ratio) + '). ' +
        second.name + ' is the furthest from it in temperature (' + temp(first) + ' against ' + temp(second) + '), so the two are a real choice rather than two shades of one idea.' +
        (rest.length ? ' I’d set ' + and(rest.map(function (s) { return s.name; })) + ' aside for now; ' + (rest.length === 1 ? 'it overlaps' : 'they overlap') + ' with one of those two.' : '');
    });
  }

  function saveTyped(ctx, text) {
    var colors = (text.match(/#[0-9a-f]{6}\b/gi) || []).map(function (c) { return c.toUpperCase(); });
    var match = text.match(/\b(?:as|called|named)\s+["“']?([^"”'.,#]+)/i);
    return schemes(ctx).then(function (list) {
      var name = match ? match[1].trim().replace(/\s+/g, ' ') : 'Palette ' + (list.length + 1);
      name = name.charAt(0).toUpperCase() + name.slice(1);
      return save(ctx, name, colors, name + ', ' + colors.length + ' colors').then(function () {
        var e = ends(colors);
        return 'Saved **' + name + '**. Darkest on lightest is ' + ratio(e.ratio) + (e.ratio >= 4.5 ? ', fine for body text.' : ', too light for body text, so treat it as an accent set.');
      });
    });
  }

  function inventory(ctx) {
    return schemes(ctx).then(function (list) {
      if (!list.length) return 'The wall is empty. Ask me for a first direction.';
      return list.length + ' palette' + (list.length === 1 ? '' : 's') + ' on the wall: ' + and(list.map(function (s) { return s.name; })) + '.';
    });
  }

  return {
    name: 'Jasper',
    role: 'Designer',
    greeting: 'Hi, I’m Jasper. Three directions are up for a new brand: Warm Dusk, Canal Morning and Workshop Sage. I can add another, shift one warmer or cooler, or check which ones hold up for text.',
    suggestions: [
      'Which palette is easiest to read?',
      'Try a calmer, coastal direction',
      'Warm up Canal Morning',
      'Which two should we take forward?',
    ],
    respond: function (text, ctx) {
      var lower = text.toLowerCase();
      if (/\b(what can you|help|what do you do|how does this work)\b/.test(lower)) {
        return 'I develop palettes for the brand and save the ones worth comparing to this gallery. Ask me for a new direction (calm, bold, earthy or dark), to warm up or cool down a palette by name, to check which ones hold up for text, or to shortlist two. Paste hex colors and I’ll save them as a palette.';
      }
      if ((text.match(/#[0-9a-f]{6}\b/gi) || []).length >= 2) return saveTyped(ctx, text);
      if (/\b(read|legib|contrast|accessib|wcag)/.test(lower)) return readability(ctx);
      if (/\b(take forward|shortlist|narrow|recommend|which (two|one|palette)|best|pick|choose)\b/.test(lower)) return shortlist(ctx);
      if (/\bwarm(er)?\b/.test(lower) && /\b(up|make|shift|turn|more|warmer)\b/.test(lower) && !/\b(new|another|direction)\b/.test(lower)) return shift(ctx, text, true);
      if (/\bcool(er)?\b/.test(lower) && /\b(down|make|shift|turn|more|cooler)\b/.test(lower) && !/\b(new|another|direction)\b/.test(lower)) return shift(ctx, text, false);
      if (/\b(calm|quiet|soft|muted|coast|sea|serene)/.test(lower)) return direction(ctx, 'calm');
      if (/\b(bold|loud|vibrant|bright|energetic|sport|punchy)/.test(lower)) return direction(ctx, 'bold');
      if (/\b(dark|night|moody)\b/.test(lower)) return direction(ctx, 'dark');
      if (/\b(earthy|clay|cozy|terracotta)\b/.test(lower)) return direction(ctx, 'warm');
      if (/\b(new|another|fresh|different|more)\b.*\b(palette|direction|scheme|option|idea)s?\b/.test(lower)) return direction(ctx, null);
      if (/\b(how many|what.*(saved|have|wall)|list)\b/.test(lower)) return inventory(ctx);
      return null;
    },
    reactions: {
      page_save_scheme: function (input) {
        var colors = (Array.isArray(input.colors) ? input.colors : []).filter(isHex);
        if (colors.length < 2) return null;
        var e = ends(colors);
        return '**' + input.name + '** is on the wall. Its darkest color on its lightest is ' + ratio(e.ratio) +
          (e.ratio >= 4.5 ? ', so it can carry body text.' : ', short of 4.5:1, so I’d keep body text off it and use it for fills and large type.');
      },
    },
  };
})();
