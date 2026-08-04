const VORB_REPLACEMENT_RATING = 3.75;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const CHART_COLORS = {
    blue: '#226eaf',
    orange: '#ec7f1d',
    ink: '#10100f',
    muted: '#595246',
    line: 'rgba(14, 14, 12, 0.24)',
    paper: '#f4f1e8'
};
const STYLE_FAMILY_LABELS = {
    Crisp: 'Crisp',
    Hop: 'Hop',
    Malt: 'Malt',
    Roast: 'Roast',
    Smoke: 'Smoke',
    'Fruit & Spice': 'Fruit & Spice',
    'Tart & Funky': 'Tart & Funky',
    'Ales - Other': 'Other ales',
    Belgian: 'Belgian',
    'IPAs+': 'IPAs',
    'Lagers+': 'Lagers',
    Smoked: 'Smoked beers',
    'Sours+Farmhouse+Wild': 'Sours, farmhouse & wild ales',
    'Stouts+Porters': 'Stouts & porters',
    Wheat: 'Wheat beers'
};
const chartsScriptUrl = typeof document !== 'undefined' && document.currentScript
    ? document.currentScript.src
    : '';

function styleMatches(beer, selection) {
    if (selection === 'all') {
        return true;
    }
    if (selection.startsWith('family::')) {
        return beer['Style Family'] === selection.slice('family::'.length);
    }
    if (selection.startsWith('style::')) {
        return beer.Style === selection.slice('style::'.length);
    }
    return false;
}

function filterBeersByStyle(beers, selection) {
    return beers.filter((beer) => styleMatches(beer, selection));
}

function buildVorbRankings(beers, selection = 'all', minimumBeers = 3) {
    const breweryRatings = new Map();
    filterBeersByStyle(beers, selection).forEach((beer) => {
        const rating = Number(beer['My Rating']);
        if (!Number.isFinite(rating)) {
            return;
        }
        if (!breweryRatings.has(beer.Brewery)) {
            breweryRatings.set(beer.Brewery, []);
        }
        breweryRatings.get(beer.Brewery).push(rating);
    });

    const rankings = [];
    breweryRatings.forEach((ratings, brewery) => {
        if (ratings.length < minimumBeers) {
            return;
        }
        const ratingSum = ratings.reduce((sum, rating) => sum + rating, 0);
        const topRating = Math.max(...ratings);
        const restAverage = ratings.length === 1
            ? topRating
            : (ratingSum - topRating) / (ratings.length - 1);
        const breweryRating = (topRating + restAverage) / 2;
        rankings.push({
            brewery,
            beersRated: ratings.length,
            breweryRating,
            vorb: (breweryRating - VORB_REPLACEMENT_RATING) * 100
        });
    });

    return rankings.sort((a, b) => b.vorb - a.vorb
        || a.brewery.localeCompare(b.brewery, undefined, { sensitivity: 'base' }));
}

function vorbMarkerColor(vorb) {
    return vorb < 0 ? CHART_COLORS.orange : CHART_COLORS.blue;
}

function standardDeviation(values) {
    if (values.length < 2) {
        return 0;
    }
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce(
        (sum, value) => sum + ((value - mean) ** 2),
        0
    ) / (values.length - 1);
    return Math.sqrt(variance);
}

function gaussianDensity(values, grid) {
    if (!values.length) {
        return grid.map(() => 0);
    }
    const estimatedBandwidth = 0.8 * 1.06
        * standardDeviation(values)
        * (values.length ** -0.2);
    const bandwidth = Math.min(0.3, Math.max(0.08, estimatedBandwidth || 0.12));
    const normalizer = values.length * bandwidth * Math.sqrt(2 * Math.PI);
    return grid.map((point) => values.reduce(
        (sum, value) => sum + Math.exp(-0.5 * (((point - value) / bandwidth) ** 2)),
        0
    ) / normalizer);
}

function createSvgElement(name, attributes = {}, text = '') {
    const element = document.createElementNS(SVG_NAMESPACE, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    if (text !== '') {
        element.textContent = text;
    }
    return element;
}

function linearScale(domainMin, domainMax, rangeMin, rangeMax) {
    const domainSpan = domainMax - domainMin || 1;
    return (value) => rangeMin
        + ((value - domainMin) / domainSpan) * (rangeMax - rangeMin);
}

function niceTicks(minimum, maximum, targetCount = 5) {
    const rawStep = Math.max((maximum - minimum) / targetCount, Number.EPSILON);
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const residual = rawStep / magnitude;
    const step = (residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1)
        * magnitude;
    const first = Math.ceil(minimum / step) * step;
    const ticks = [];
    for (let value = first; value <= maximum + step / 2; value += step) {
        ticks.push(Math.abs(value) < step / 100 ? 0 : value);
    }
    return ticks;
}

function formatTick(value) {
    return Math.abs(value) >= 10 || Number.isInteger(value)
        ? value.toFixed(0)
        : value.toFixed(1);
}

function setSvgDimensions(svg, width, height) {
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
}

function showVorbTooltip(tooltip, card, event, ranking) {
    const heading = document.createElement('strong');
    heading.textContent = ranking.brewery;
    const score = document.createElement('span');
    score.textContent = `VORB ${ranking.vorb.toFixed(1)}`;
    const count = document.createElement('span');
    count.textContent = `${ranking.beersRated} beers rated · brewery rating ${ranking.breweryRating.toFixed(2)}`;
    tooltip.replaceChildren(heading, score, count);
    tooltip.hidden = false;

    const cardRect = card.getBoundingClientRect();
    const targetRect = event.currentTarget.getBoundingClientRect();
    const pointerX = Number.isFinite(event.clientX) && event.clientX > 0
        ? event.clientX
        : targetRect.left + targetRect.width / 2;
    const pointerY = Number.isFinite(event.clientY) && event.clientY > 0
        ? event.clientY
        : targetRect.top;
    const left = Math.min(
        Math.max(pointerX - cardRect.left + 12, 8),
        cardRect.width - tooltip.offsetWidth - 8
    );
    const top = Math.max(pointerY - cardRect.top - tooltip.offsetHeight - 10, 8);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

function drawVorbChart(svg, rankings, tooltip, card) {
    const margin = { top: 22, right: 28, bottom: 154, left: 70 };
    const width = Math.max(760, margin.left + margin.right + rankings.length * 54);
    const height = 470;
    setSvgDimensions(svg, width, height);
    svg.appendChild(createSvgElement(
        'title',
        {},
        `VORB rankings for ${rankings.length} breweries`
    ));

    const values = rankings.map((ranking) => ranking.vorb);
    const rawMinimum = Math.min(0, ...values);
    const rawMaximum = Math.max(0, ...values);
    const padding = Math.max(8, (rawMaximum - rawMinimum) * 0.08);
    const yMinimum = rawMinimum - padding;
    const yMaximum = rawMaximum + padding;
    const xScale = linearScale(
        0,
        Math.max(rankings.length - 1, 1),
        margin.left,
        width - margin.right
    );
    const yScale = linearScale(yMinimum, yMaximum, height - margin.bottom, margin.top);

    niceTicks(yMinimum, yMaximum).forEach((tick) => {
        const y = yScale(tick);
        svg.appendChild(createSvgElement('line', {
            x1: margin.left,
            x2: width - margin.right,
            y1: y,
            y2: y,
            class: tick === 0 ? 'chart-zero-line' : 'chart-grid-line'
        }));
        svg.appendChild(createSvgElement('text', {
            x: margin.left - 12,
            y: y + 5,
            'text-anchor': 'end',
            class: 'chart-tick-label'
        }, formatTick(tick)));
    });

    svg.appendChild(createSvgElement('line', {
        x1: margin.left,
        x2: margin.left,
        y1: margin.top,
        y2: height - margin.bottom,
        class: 'chart-axis-line'
    }));
    svg.appendChild(createSvgElement('text', {
        x: 20,
        y: (margin.top + height - margin.bottom) / 2,
        transform: `rotate(-90 20 ${(margin.top + height - margin.bottom) / 2})`,
        'text-anchor': 'middle',
        class: 'chart-axis-title'
    }, 'VORB'));

    rankings.forEach((ranking, index) => {
        const x = xScale(index);
        const y = yScale(ranking.vorb);
        const radius = 6 + Math.min(ranking.beersRated, 20) * 0.22;
        const marker = createSvgElement('g', {
            class: 'vorb-marker',
            tabindex: '0',
            role: 'img',
            'aria-label': `${ranking.brewery}, VORB ${ranking.vorb.toFixed(1)}, ${ranking.beersRated} beers rated`
        });
        marker.appendChild(createSvgElement('polygon', {
            points: `${x},${y - radius} ${x + radius},${y} ${x},${y + radius} ${x - radius},${y}`,
            fill: vorbMarkerColor(ranking.vorb)
        }));
        marker.addEventListener('mouseenter', (event) => {
            showVorbTooltip(tooltip, card, event, ranking);
        });
        marker.addEventListener('mousemove', (event) => {
            showVorbTooltip(tooltip, card, event, ranking);
        });
        marker.addEventListener('focus', (event) => {
            showVorbTooltip(tooltip, card, event, ranking);
        });
        marker.addEventListener('mouseleave', () => {
            tooltip.hidden = true;
        });
        marker.addEventListener('blur', () => {
            tooltip.hidden = true;
        });
        svg.appendChild(marker);

        svg.appendChild(createSvgElement('text', {
            x: x - 3,
            y: height - margin.bottom + 17,
            transform: `rotate(-55 ${x - 3} ${height - margin.bottom + 17})`,
            'text-anchor': 'end',
            class: 'chart-category-label'
        }, ranking.brewery));
    });
}

function linePath(grid, values, xScale, yScale) {
    return grid.map(
        (point, index) => `${index === 0 ? 'M' : 'L'}${xScale(point).toFixed(2)},${yScale(values[index]).toFixed(2)}`
    ).join(' ');
}

function areaPath(grid, values, xScale, yScale, baseline) {
    const line = linePath(grid, values, xScale, yScale);
    return `${line} L${xScale(grid.at(-1)).toFixed(2)},${baseline} L${xScale(grid[0]).toFixed(2)},${baseline} Z`;
}

function drawDensityChart(svg, beers) {
    const width = 960;
    const height = 430;
    const margin = { top: 26, right: 28, bottom: 64, left: 70 };
    setSvgDimensions(svg, width, height);
    svg.appendChild(createSvgElement(
        'title',
        {},
        `Personal and Untappd rating distributions for ${beers.length} beers`
    ));

    const personalRatings = beers
        .map((beer) => Number(beer['My Rating']))
        .filter(Number.isFinite);
    const untappdRatings = beers
        .map((beer) => Number(beer['Untappd Rating']))
        .filter((rating) => Number.isFinite(rating) && rating > 0);
    const grid = Array.from({ length: 201 }, (_, index) => 1 + (4 * index) / 200);
    const personalDensity = gaussianDensity(personalRatings, grid);
    const untappdDensity = gaussianDensity(untappdRatings, grid);
    const maximumDensity = Math.max(...personalDensity, ...untappdDensity) * 1.08;
    const xScale = linearScale(1, 5, margin.left, width - margin.right);
    const yScale = linearScale(0, maximumDensity, height - margin.bottom, margin.top);
    const baseline = height - margin.bottom;

    niceTicks(0, maximumDensity, 4).forEach((tick) => {
        const y = yScale(tick);
        svg.appendChild(createSvgElement('line', {
            x1: margin.left,
            x2: width - margin.right,
            y1: y,
            y2: y,
            class: 'chart-grid-line'
        }));
    });
    [1, 2, 3, 4, 5].forEach((tick) => {
        const x = xScale(tick);
        svg.appendChild(createSvgElement('line', {
            x1: x,
            x2: x,
            y1: baseline,
            y2: baseline + 6,
            class: 'chart-axis-line'
        }));
        svg.appendChild(createSvgElement('text', {
            x,
            y: baseline + 28,
            'text-anchor': 'middle',
            class: 'chart-tick-label'
        }, tick.toFixed(0)));
    });

    svg.appendChild(createSvgElement('path', {
        d: areaPath(grid, untappdDensity, xScale, yScale, baseline),
        fill: CHART_COLORS.orange,
        class: 'density-area'
    }));
    svg.appendChild(createSvgElement('path', {
        d: linePath(grid, untappdDensity, xScale, yScale),
        stroke: CHART_COLORS.orange,
        class: 'density-line'
    }));
    svg.appendChild(createSvgElement('path', {
        d: areaPath(grid, personalDensity, xScale, yScale, baseline),
        fill: CHART_COLORS.blue,
        class: 'density-area'
    }));
    svg.appendChild(createSvgElement('path', {
        d: linePath(grid, personalDensity, xScale, yScale),
        stroke: CHART_COLORS.blue,
        class: 'density-line'
    }));

    svg.appendChild(createSvgElement('line', {
        x1: margin.left,
        x2: width - margin.right,
        y1: baseline,
        y2: baseline,
        class: 'chart-axis-line'
    }));
    svg.appendChild(createSvgElement('text', {
        x: (margin.left + width - margin.right) / 2,
        y: height - 14,
        'text-anchor': 'middle',
        class: 'chart-axis-title'
    }, 'Rating'));
    svg.appendChild(createSvgElement('text', {
        x: 20,
        y: (margin.top + baseline) / 2,
        transform: `rotate(-90 20 ${(margin.top + baseline) / 2})`,
        'text-anchor': 'middle',
        class: 'chart-axis-title'
    }, 'Density'));
}

function selectionLabel(selection) {
    if (selection === 'all') {
        return 'all styles';
    }
    if (selection.startsWith('family::')) {
        const family = selection.slice('family::'.length);
        return STYLE_FAMILY_LABELS[family] || family;
    }
    return selection.slice('style::'.length);
}

function populateStyleFilter(select, beers, includeExactStyles = true) {
    const familyCounts = new Map();
    const styleCounts = new Map();
    beers.forEach((beer) => {
        familyCounts.set(
            beer['Style Family'],
            (familyCounts.get(beer['Style Family']) || 0) + 1
        );
        styleCounts.set(beer.Style, (styleCounts.get(beer.Style) || 0) + 1);
    });

    const familyGroup = document.createElement('optgroup');
    familyGroup.label = 'Style families';
    [...familyCounts].sort((a, b) => (STYLE_FAMILY_LABELS[a[0]] || a[0])
        .localeCompare(STYLE_FAMILY_LABELS[b[0]] || b[0]))
        .forEach(([family, count]) => {
            const option = document.createElement('option');
            option.value = `family::${family}`;
            option.textContent = `${STYLE_FAMILY_LABELS[family] || family} (${count})`;
            familyGroup.appendChild(option);
        });

    const styleGroup = document.createElement('optgroup');
    styleGroup.label = 'Exact styles';
    [...styleCounts].sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([style, count]) => {
            const option = document.createElement('option');
            option.value = `style::${style}`;
            option.textContent = `${style} (${count})`;
            styleGroup.appendChild(option);
        });
    select.appendChild(familyGroup);
    if (includeExactStyles) {
        select.appendChild(styleGroup);
    }
}

function maximumBreweryCount(beers, selection) {
    const counts = new Map();
    filterBeersByStyle(beers, selection).forEach((beer) => {
        counts.set(beer.Brewery, (counts.get(beer.Brewery) || 0) + 1);
    });
    return Math.max(1, ...counts.values());
}

async function initializeInteractiveCharts() {
    const vorbChart = document.getElementById('vorbChart');
    const densityChart = document.getElementById('densityChart');
    if (!vorbChart && !densityChart) {
        return;
    }

    const dataUrl = new URL('../data/beer_data.json', chartsScriptUrl).href;
    const response = await fetch(dataUrl);
    if (!response.ok) {
        throw new Error(`Beer ratings request failed with status ${response.status}`);
    }
    const beers = await response.json();

    const vorbStyle = document.getElementById('vorbStyleFilter');
    const vorbMinimum = document.getElementById('vorbMinBeers');
    const vorbMinimumValue = document.getElementById('vorbMinBeersValue');
    const vorbSummary = document.getElementById('vorbChartSummary');
    const vorbEmpty = document.getElementById('vorbChartEmpty');
    const vorbTooltip = document.getElementById('vorbTooltip');
    const vorbCard = vorbChart.closest('.interactive-chart-card');
    const densityStyle = document.getElementById('densityStyleFilter');
    const densitySummary = document.getElementById('densityChartSummary');
    const densityEmpty = document.getElementById('densityChartEmpty');

    populateStyleFilter(vorbStyle, beers);
    populateStyleFilter(densityStyle, beers, false);

    function renderVorb() {
        const selectedStyle = vorbStyle.value;
        const maximum = maximumBreweryCount(beers, selectedStyle);
        vorbMinimum.max = String(maximum);
        if (Number(vorbMinimum.value) > maximum) {
            vorbMinimum.value = String(maximum);
        }
        const minimum = Number(vorbMinimum.value);
        vorbMinimumValue.value = `${minimum}+`;
        vorbMinimumValue.textContent = `${minimum}+`;
        const rankings = buildVorbRankings(beers, selectedStyle, minimum);
        vorbSummary.textContent = `${rankings.length.toLocaleString()} ${rankings.length === 1 ? 'brewery' : 'breweries'} · ${selectionLabel(selectedStyle)} · ${minimum}+ beers rated`;
        vorbEmpty.hidden = rankings.length > 0;
        vorbChart.hidden = rankings.length === 0;
        if (rankings.length) {
            drawVorbChart(vorbChart, rankings, vorbTooltip, vorbCard);
        }
    }

    function renderDensity() {
        const selectedStyle = densityStyle.value;
        const filtered = filterBeersByStyle(beers, selectedStyle);
        densitySummary.textContent = `${filtered.length.toLocaleString()} ${filtered.length === 1 ? 'beer' : 'beers'} · ${selectionLabel(selectedStyle)}`;
        densityEmpty.hidden = filtered.length > 0;
        densityChart.hidden = filtered.length === 0;
        if (filtered.length) {
            drawDensityChart(densityChart, filtered);
        }
    }

    vorbStyle.addEventListener('change', renderVorb);
    vorbMinimum.addEventListener('input', renderVorb);
    densityStyle.addEventListener('change', renderDensity);
    renderVorb();
    renderDensity();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        buildVorbRankings,
        filterBeersByStyle,
        gaussianDensity,
        maximumBreweryCount,
        standardDeviation,
        styleMatches,
        vorbMarkerColor
    };
}

if (typeof document !== 'undefined') {
    initializeInteractiveCharts().catch((error) => {
        console.error('Error loading interactive charts:', error);
        document.querySelectorAll('.interactive-chart-summary').forEach((summary) => {
            summary.textContent = 'Unable to load chart data.';
        });
    });
}
