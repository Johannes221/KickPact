const { chromium } = require('playwright');

const playerCache = {};

async function withPage(fn) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await browser.close();
  }
}

function extractId(url, pattern) {
  const m = url.match(pattern);
  return m ? m[1] : null;
}

async function searchVereine(suchbegriff) {
  return withPage(async (page) => {
    const url = `https://www.fussball.de/suche/-/text/${encodeURIComponent(suchbegriff)}/restriction/-1#!/`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const vereine = await page.evaluate(() => {
      const results = [];
      const links = document.querySelectorAll('a[href*="/verein/"]');
      const seen = new Set();
      links.forEach(link => {
        const href = link.href || link.getAttribute('href') || '';
        const m = href.match(/\/verein\/([^/]+)\/-\/id\/([A-Z0-9]+)/);
        if (m && !seen.has(m[2])) {
          seen.add(m[2]);
          const name = (link.textContent.replace(/\s+/g, ' ').trim()) || m[1];
          results.push({
            name: name || m[1],
            slug: m[1],
            vereinId: m[2],
            url: href
          });
        }
      });
      return results;
    });

    return vereine;
  });
}

async function getMannschaften(vereinId, slug) {
  return withPage(async (page) => {
    const url = `https://www.fussball.de/verein/${slug}/-/id/${vereinId}#!/`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const mannschaften = await page.evaluate(() => {
      const results = [];
      const seen = new Set();
      const links = document.querySelectorAll('a[href*="/mannschaft/"]');
      links.forEach(link => {
        const href = link.href || link.getAttribute('href') || '';
        const m = href.match(/\/mannschaft\/([^/]+)\/-\/saison\/(\d+)\/team-id\/([A-Z0-9]+)/);
        if (m && !seen.has(m[3])) {
          seen.add(m[3]);
          const name = link.textContent.replace(/\s+/g, ' ').trim();
          results.push({
            name: name || m[1],
            slug: m[1],
            saison: m[2],
            teamId: m[3],
            url: href
          });
        }
      });
      return results;
    });

    return mannschaften;
  });
}

async function getSpiele(teamId, slug, saison = '2526') {
  return withPage(async (page) => {
    const url = `https://www.fussball.de/mannschaft/${slug}/-/saison/${saison}/team-id/${teamId}#!/`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Navigate directly to the AJAX endpoint for past games (avoids cookie banner blocking tab click)
    const ajaxUrl = `https://www.fussball.de/ajax.team.prev.games/-/mode/PAGE/team-id/${teamId}`;
    try {
      await page.goto(ajaxUrl, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1500);
    } catch (e) {
      // fallback: already on main page
    }

    const spiele = await page.evaluate(() => {
      const results = [];
      const seen = new Set();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const parseDatum = (d) => {
        const parts = d.split('.');
        if (parts.length !== 3) return null;
        const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
        return new Date(`${year}-${parts[1]}-${parts[0]}`);
      };

      // Strategy 1: AJAX page structure — iterate all TRs, track last date from .row-headline
      const allTrs = [...document.querySelectorAll('tr')];
      let currentDatum = '';
      allTrs.forEach(tr => {
        // Date header row — extract date
        if (tr.classList.contains('row-headline') || tr.classList.contains('row-competition')) {
          const txt = tr.textContent.replace(/\s+/g, ' ').trim();
          const dm = txt.match(/(\d{2}\.\d{2}\.\d{4})/);
          const dm2 = txt.match(/(\d{2}\.\d{2}\.\d{2})(?!\d)/);
          if (dm) currentDatum = dm[1];
          else if (dm2) currentDatum = dm2[1];
          return;
        }

        const link = tr.querySelector('a[href*="/spiel/"]');
        if (!link) return;
        const href = link.href || '';
        const m = href.match(/\/spiel\/([^/]+)\/-\/spiel\/([A-Z0-9]+)/);
        if (!m || seen.has(m[2])) return;

        const datum = currentDatum;
        if (!datum) return;

        const matchDate = parseDatum(datum);
        if (!matchDate || matchDate >= today) return; // skip future/today

        seen.add(m[2]);

        // Extract teams from TDs: ["", "TeamA", ":", "TeamB", ":", "Zum Spiel"]
        const tds = [...tr.querySelectorAll('td')].map(td => td.textContent.replace(/\s+/g, ' ').trim());
        const teamTds = tds.filter(t => t && t !== ':' && t !== 'Zum Spiel' && t !== '');
        const heim = teamTds[0] || '';
        const gast = teamTds[1] || '';

        results.push({ spielId: m[2], slug: m[1], datum, heim, gast, ergebnis: '', vergangen: true, url: href });
      });

      // Strategy 2: fallback for non-AJAX structure (LI links with date in row text)
      if (results.length === 0) {
        document.querySelectorAll('a[href*="/spiel/"]').forEach(link => {
          const href = link.href || '';
          const m = href.match(/\/spiel\/([^/]+)\/-\/spiel\/([A-Z0-9]+)/);
          if (!m || seen.has(m[2])) return;
          const row = link.closest('tr') || link.closest('li') || link.parentElement;
          const rowText = (row || link).textContent.replace(/\s+/g, ' ').trim();
          const dm4 = rowText.match(/(\d{2}\.\d{2}\.\d{4})/);
          const dm2 = rowText.match(/(\d{2}\.\d{2}\.\d{2})(?!\d)/);
          const datum = dm4 ? dm4[1] : dm2 ? dm2[1] : '';
          if (!datum) return;
          const matchDate = parseDatum(datum);
          if (!matchDate || matchDate >= today) return;
          seen.add(m[2]);
          const tm = rowText.match(/(?:Meisterschaften|Pokal[^|]*|Freundschaft[^|]*)\s+([^|:]+?)\s*-\s*([^|:]+?)\s*(?::|$)/i)
            || rowText.match(/(?:Herren|Damen|Jugend[^\s]*)\s+(.+?)\s*:\s*(.+?)\s*:\s*Zum Spiel/i)
            || rowText.match(/^(.+?)\s*:\s*(.+?)\s*:\s*Zum Spiel/i);
          results.push({ spielId: m[2], slug: m[1], datum, heim: tm?.[1]?.trim()||'', gast: tm?.[2]?.trim()||'', ergebnis: '', vergangen: true, url: href });
        });
      }

      return results;
    });

    // Fallback: extract teams from slug if not found
    for (const spiel of spiele) {
      if (!spiel.heim || !spiel.gast) {
        const slug2 = spiel.slug;
        const sep = slug2.includes('-flex-') ? '-flex-' : slug2.includes('-vs-') ? '-vs-' : null;
        if (sep) {
          const parts = slug2.split(sep);
          spiel.heim = parts[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          spiel.gast = parts[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
      }
    }

    // Sort by date descending (most recent first)
    spiele.sort((a, b) => {
      const parse = d => {
        const p = d.split('.'); if (p.length !== 3) return 0;
        const y = p[2].length === 2 ? '20' + p[2] : p[2];
        return new Date(`${y}-${p[1]}-${p[0]}`).getTime();
      };
      return parse(b.datum) - parse(a.datum);
    });

    return spiele;
  });
}

function extractPlayerIdFromUrl(url) {
  const m = url.match(/\/(?:player-id|userid)\/([A-Z0-9]+)/i);
  return m ? m[1] : null;
}

async function getPlayerName(page, playerUrl) {
  const id = extractPlayerIdFromUrl(playerUrl);
  if (!id) return playerUrl;
  if (playerCache[id]) return playerCache[id];

  try {
    await page.goto(playerUrl, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1000);

    const name = await page.evaluate(() => {
      const title = document.title;
      const mTitle = title.match(/^(.+?)\s*(?:Basisprofil|Profil|\|)/i);
      if (mTitle) return mTitle[1].trim();
      const metaTitle = document.querySelector('meta[property="og:title"]')?.content;
      if (metaTitle) {
        const mm = metaTitle.match(/^(.+?)\s*(?:Basisprofil|Profil|\|)/i);
        if (mm) return mm[1].trim();
      }
      return title.split('|')[0].trim();
    });

    playerCache[id] = name || id;
    return playerCache[id];
  } catch (e) {
    playerCache[id] = id;
    return id;
  }
}

async function getSpielDetails(spielId, slug) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    const url = `https://www.fussball.de/spiel/${slug || 'spiel'}/-/spiel/${spielId}#!/`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const raw = await page.evaluate(() => {
      const result = {
        heim: '',
        gast: '',
        ergebnisHeim: null,
        ergebnisGast: null,
        halbzeitHeim: null,
        halbzeitGast: null,
        rawEvents: [],
        spielerUrls: []
      };

      const teamHome = document.querySelector('.team-home .team-name');
      const teamAway = document.querySelector('.team-away .team-name');
      result.heim = teamHome?.textContent?.replace(/\s+/g, ' ').trim() || '';
      result.gast = teamAway?.textContent?.replace(/\s+/g, ' ').trim() || '';

      const matchCourse = document.querySelector('.match-course');
      const rowEvents = matchCourse ? [...matchCourse.querySelectorAll('.row-event')] : [];
      rowEvents.forEach(row => {
        const isRight = row.classList.contains('event-right');
        const isLeft = row.classList.contains('event-left');
        const minute = row.querySelector('.valign-inner')?.textContent?.replace(/\s+/g, '').replace("'", '').trim();
        const isGoal = row.querySelector('.hexagon.green') !== null;
        const isSubstitute = row.querySelector('.icon-substitute') !== null;
        const playerLinks = [...row.querySelectorAll('a[href*="spielerprofil"]')].map(a => a.href).filter(h => h.includes('/player-id/') || h.includes('/userid/'));

        const side = isRight ? 'gast' : isLeft ? 'heim' : 'unbekannt';
        const minuteNum = minute ? parseInt(minute) : null;

        if ((isGoal || isSubstitute) && playerLinks.length > 0) {
          result.rawEvents.push({ typ: isGoal ? 'TOR' : 'AUSWECHSLUNG', minute: minuteNum, side, playerLinks });
          playerLinks.forEach(u => {
            if (!result.spielerUrls.includes(u)) result.spielerUrls.push(u);
          });
        }
      });

      const goals = result.rawEvents.filter(e => e.typ === 'TOR');
      result.ergebnisHeim = goals.filter(g => g.side === 'heim').length;
      result.ergebnisGast = goals.filter(g => g.side === 'gast').length;

      const firstHalfGoals = goals.filter(g => g.minute !== null && g.minute <= 45);
      result.halbzeitHeim = firstHalfGoals.filter(g => g.side === 'heim').length;
      result.halbzeitGast = firstHalfGoals.filter(g => g.side === 'gast').length;

      return result;
    });

    const playerNames = {};
    // Filter out already-cached players
    const uncachedUrls = raw.spielerUrls.filter(u => {
      const id = extractPlayerIdFromUrl(u);
      return id && !playerCache[id];
    });

    // Load uncached players sequentially with reduced delay
    for (const url of uncachedUrls) {
      await page.waitForTimeout(800);
      const name = await getPlayerName(page, url);
      const id = extractPlayerIdFromUrl(url);
      if (id) playerNames[id] = name;
    }

    // Merge cache into playerNames
    for (const url of raw.spielerUrls) {
      const id = extractPlayerIdFromUrl(url);
      if (id && playerCache[id]) playerNames[id] = playerCache[id];
    }

    function nameForUrl(url) {
      const id = extractPlayerIdFromUrl(url);
      return id ? (playerNames[id] || id) : url;
    }
    function idForUrl(url) {
      return extractPlayerIdFromUrl(url) || url;
    }

    const events = [];
    for (const ev of raw.rawEvents) {
      if (ev.typ === 'TOR' && ev.playerLinks.length >= 1) {
        events.push({
          typ: 'TOR',
          minute: ev.minute,
          spielerId: idForUrl(ev.playerLinks[0]),
          spielerName: nameForUrl(ev.playerLinks[0]),
          mannschaft: ev.side
        });
      } else if (ev.typ === 'AUSWECHSLUNG' && ev.playerLinks.length >= 2) {
        events.push({
          typ: 'AUSWECHSLUNG',
          minute: ev.minute,
          rein: { id: idForUrl(ev.playerLinks[0]), name: nameForUrl(ev.playerLinks[0]) },
          raus: { id: idForUrl(ev.playerLinks[1]), name: nameForUrl(ev.playerLinks[1]) },
          mannschaft: ev.side
        });
      }
    }

    events.sort((a, b) => (a.minute || 999) - (b.minute || 999));

    const ergebnisHeim = raw.ergebnisHeim ?? 0;
    const ergebnisGast = raw.ergebnisGast ?? 0;

    const toreProSpieler = {};
    events.filter(e => e.typ === 'TOR').forEach(e => {
      toreProSpieler[e.spielerName] = (toreProSpieler[e.spielerName] || 0) + 1;
    });

    const hattrick = Object.values(toreProSpieler).some(t => t >= 3);
    const sieg = ergebnisGast > ergebnisHeim;
    const niederlage = ergebnisGast < ergebnisHeim;
    const unentschieden = ergebnisGast === ergebnisHeim;
    const zuNull = ergebnisHeim === 0;
    const toreDifferenz = Math.abs(ergebnisHeim - ergebnisGast);

    let comebackSieg = false;
    if (raw.halbzeitHeim !== null && raw.halbzeitGast !== null && sieg) {
      comebackSieg = raw.halbzeitGast < raw.halbzeitHeim;
    }

    return {
      spielId,
      heim: raw.heim,
      gast: raw.gast,
      ergebnis: { heim: ergebnisHeim, gast: ergebnisGast },
      halbzeit: raw.halbzeitHeim !== null ? { heim: raw.halbzeitHeim, gast: raw.halbzeitGast } : null,
      events,
      kickpactTrigger: {
        sieg,
        niederlage,
        unentschieden,
        zuNull,
        toreDifferenz,
        hattrick,
        comebackSieg,
        toreProSpieler
      }
    };
  } finally {
    await browser.close();
  }
}

async function crawlAll(teamId, slug, saison = '2526') {
  const spiele = await getSpiele(teamId, slug, saison);
  const results = [];
  for (const spiel of spiele) {
    if (!spiel.ergebnis) continue;
    await new Promise(r => setTimeout(r, 1500));
    try {
      const details = await getSpielDetails(spiel.spielId, spiel.slug);
      details.datum = spiel.datum;
      if (!details.heim) details.heim = spiel.heim;
      if (!details.gast) details.gast = spiel.gast;
      results.push(details);
    } catch (e) {
      results.push({ spielId: spiel.spielId, error: e.message });
    }
  }
  return results;
}

module.exports = { searchVereine, getMannschaften, getSpiele, getSpielDetails, crawlAll };
