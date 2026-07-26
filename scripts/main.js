// Resolve assets from the deployed site, including GitHub Pages project subpaths.
const siteRootUrl = new URL('../', document.currentScript.src);
const siteAssetUrl = (path) => new URL(path, siteRootUrl).href;
const breweryJsonUrl = siteAssetUrl('data/VORB_data.json');
const beerJsonUrl = siteAssetUrl('data/beer_data.json');
const pizzaGeoJsonUrl = siteAssetUrl('data/pizzerias.geojson');
const breweryGeoJsonUrl = siteAssetUrl('data/brewery_data.geojson');
const jsonRequests = new Map();
const textCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function fetchJsonData(url) {
    if (!jsonRequests.has(url)) {
        jsonRequests.set(
            url,
            fetch(url)
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`Request failed with status ${response.status}`);
                    }
                    return response.json();
                })
                .catch((error) => {
                    console.error(`Error fetching ${url}:`, error);
                    return null;
                })
        );
    }
    return jsonRequests.get(url);
}

function parseDateValue(value) {
    if (!value) {
        return null;
    }
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : timestamp;
}

function formatDate(value) {
    const timestamp = parseDateValue(value);
    if (timestamp === null) {
        return '—';
    }
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    }).format(new Date(timestamp));
}

function isBlank(value) {
    return value === null || value === undefined || String(value).trim() === '';
}

function sortableValue(header, value) {
    if (header === 'Date') {
        return parseDateValue(value);
    }
    if (typeof value === 'number') {
        return value;
    }
    const stringValue = String(value ?? '').trim();
    if (/^-?\d+(?:\.\d+)?%?$/.test(stringValue)) {
        return Number.parseFloat(stringValue);
    }
    return stringValue;
}

function defaultSortDirection(data, header) {
    if (header === 'Date') {
        return 'desc';
    }

    const populatedValues = data
        .map((row) => row[header])
        .filter((value) => !isBlank(value));
    const isNumericColumn = populatedValues.length > 0
        && populatedValues.every((value) => typeof sortableValue(header, value) === 'number');

    return isNumericColumn ? 'desc' : 'asc';
}

function compareRows(a, b, header, direction) {
    const aRaw = a[header];
    const bRaw = b[header];
    const aBlank = isBlank(aRaw) || (header === 'Date' && parseDateValue(aRaw) === null);
    const bBlank = isBlank(bRaw) || (header === 'Date' && parseDateValue(bRaw) === null);

    if (aBlank !== bBlank) {
        return aBlank ? 1 : -1;
    }
    if (aBlank && bBlank) {
        return textCollator.compare(String(a.Pizzeria ?? a.Beer ?? ''), String(b.Pizzeria ?? b.Beer ?? ''));
    }

    const aValue = sortableValue(header, aRaw);
    const bValue = sortableValue(header, bRaw);
    const result = typeof aValue === 'number' && typeof bValue === 'number'
        ? aValue - bValue
        : textCollator.compare(String(aValue), String(bValue));
    return direction === 'desc' ? -result : result;
}

function formatDisplayValue(header, value) {
    if (header === 'Date') {
        return formatDate(value);
    }
    if ((header === 'Untappd Rating' || header === 'Global Avg Rating') && !isBlank(value)) {
        const rating = Number(value);
        return Number.isFinite(rating) ? rating.toFixed(2) : String(value);
    }
    return isBlank(value) ? '—' : String(value);
}

function rowLabel(row) {
    return row.Pizzeria || row.Beer || row.Brewery || 'Rating';
}

function createImageCell(row, header) {
    const cell = document.createElement('td');
    const source = row[header];
    if (!source) {
        cell.textContent = '—';
        cell.className = 'empty-cell';
        return cell;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'thumbnail-button';
    button.setAttribute('aria-label', `View ${rowLabel(row)} image`);

    const image = document.createElement('img');
    image.src = source;
    image.alt = '';
    image.loading = 'lazy';
    image.addEventListener('error', () => {
        button.hidden = true;
    });

    button.appendChild(image);
    button.addEventListener('click', () => openPhotoViewer(source, rowLabel(row)));
    cell.appendChild(button);
    return cell;
}

function createTextCell(row, header) {
    const cell = document.createElement('td');
    const value = row[header];

    if (header === 'Brewery' && !isBlank(value)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'table-link';
        button.textContent = String(value);
        button.setAttribute('aria-label', `View rated beers from ${value}`);
        button.addEventListener('click', () => openBreweryViewer(String(value)));
        cell.appendChild(button);
    } else {
        cell.textContent = formatDisplayValue(header, value);
    }

    if (typeof value === 'number') {
        cell.classList.add('numeric');
    }
    if (header === 'Notes') {
        cell.classList.add('notes-cell');
    }
    if (header === 'Date') {
        cell.classList.add('date-cell');
    }
    return cell;
}

globalThis.buildHtmlTable = function buildHtmlTable(data, containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }
    if (!data || data.length === 0) {
        container.innerHTML = '<p class="table-loading">No data available</p>';
        return;
    }

    const headers = Object.keys(data[0]);
    const sortState = options.initialSort
        ? { ...options.initialSort }
        : { key: '', direction: 'asc' };
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    const body = document.createElement('tbody');
    const headerCells = new Map();

    function updateSortHeaders() {
        headerCells.forEach((cell, header) => {
            const active = sortState.key === header;
            cell.classList.toggle('asc', active && sortState.direction === 'asc');
            cell.classList.toggle('desc', active && sortState.direction === 'desc');
            cell.setAttribute('aria-sort', active
                ? (sortState.direction === 'asc' ? 'ascending' : 'descending')
                : 'none');
        });
    }

    function renderRows() {
        const rows = [...data];
        if (sortState.key) {
            rows.sort((a, b) => compareRows(a, b, sortState.key, sortState.direction));
        }

        body.replaceChildren();
        const fragment = document.createDocumentFragment();
        rows.forEach((row) => {
            const tableRow = document.createElement('tr');
            headers.forEach((header) => {
                tableRow.appendChild(
                    header === options.imageColumn
                        ? createImageCell(row, header)
                        : createTextCell(row, header)
                );
            });
            fragment.appendChild(tableRow);
        });
        body.appendChild(fragment);
        updateSortHeaders();
    }

    headers.forEach((header) => {
        const cell = document.createElement('th');
        cell.scope = 'col';
        const headerLabel = header === 'VORB' ? 'VORB*' : header;

        if (header === options.imageColumn) {
            cell.textContent = headerLabel;
            headRow.appendChild(cell);
            return;
        }

        cell.className = 'sortable';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sort-button';
        button.innerHTML = `<span>${headerLabel}</span><span class="sort-indicator" aria-hidden="true"></span>`;
        button.addEventListener('click', () => {
            if (sortState.key === header) {
                sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortState.key = header;
                sortState.direction = defaultSortDirection(data, header);
            }
            renderRows();
        });
        cell.appendChild(button);
        headRow.appendChild(cell);
        headerCells.set(header, cell);
    });

    head.appendChild(headRow);
    table.append(head, body);
    container.replaceChildren(table);
    renderRows();
};

function prepareDialog(dialog) {
    dialog.querySelector('[data-dialog-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) {
            dialog.close();
        }
    });
    document.body.appendChild(dialog);
    return dialog;
}

function getPhotoDialog() {
    const existing = document.getElementById('photo-viewer');
    if (existing) {
        return existing;
    }
    const dialog = document.createElement('dialog');
    dialog.id = 'photo-viewer';
    dialog.className = 'site-dialog photo-dialog';
    dialog.innerHTML = `
        <div class="dialog-toolbar">
            <p>Photo</p>
            <button type="button" data-dialog-close>Close</button>
        </div>
        <figure class="photo-viewer-figure">
            <img alt="">
            <figcaption></figcaption>
        </figure>
    `;
    return prepareDialog(dialog);
}

function openPhotoViewer(source, caption) {
    const dialog = getPhotoDialog();
    const image = dialog.querySelector('img');
    const figureCaption = dialog.querySelector('figcaption');
    image.src = source;
    image.alt = caption;
    figureCaption.textContent = caption;
    dialog.showModal();
}

function getBreweryDialog() {
    const existing = document.getElementById('brewery-viewer');
    if (existing) {
        return existing;
    }
    const dialog = document.createElement('dialog');
    dialog.id = 'brewery-viewer';
    dialog.className = 'site-dialog brewery-dialog';
    dialog.innerHTML = `
        <div class="dialog-toolbar">
            <p>Rated beers</p>
            <button type="button" data-dialog-close>Close</button>
        </div>
        <div class="brewery-dialog-heading">
            <p class="page-eyebrow" data-brewery-count></p>
            <h2 data-brewery-title></h2>
        </div>
        <div class="beer-detail-list" data-beer-list></div>
    `;
    return prepareDialog(dialog);
}

function createBeerDetail(beer) {
    const item = document.createElement('article');
    item.className = 'beer-detail';

    if (beer.Label) {
        const image = document.createElement('img');
        image.src = beer.Label;
        image.alt = '';
        image.loading = 'lazy';
        image.addEventListener('error', () => image.remove());
        item.appendChild(image);
    }

    const copy = document.createElement('div');
    copy.className = 'beer-detail-copy';
    const title = document.createElement('h3');
    title.textContent = beer.Beer;
    const style = document.createElement('p');
    style.textContent = [beer.Style, beer.ABV].filter(Boolean).join(' · ');
    copy.append(title, style);

    const ratings = document.createElement('dl');
    ratings.className = 'beer-detail-ratings';
    const ratingPairs = [
        ['My rating', formatDisplayValue('My Rating', beer['My Rating'])],
        ['Untappd', formatDisplayValue('Untappd Rating', beer['Untappd Rating'])]
    ];
    ratingPairs.forEach(([label, value]) => {
        const term = document.createElement('dt');
        term.textContent = label;
        const description = document.createElement('dd');
        description.textContent = value;
        ratings.append(term, description);
    });

    item.append(copy, ratings);
    return item;
}

async function openBreweryViewer(breweryName) {
    const dialog = getBreweryDialog();
    const title = dialog.querySelector('[data-brewery-title]');
    const count = dialog.querySelector('[data-brewery-count]');
    const list = dialog.querySelector('[data-beer-list]');
    title.textContent = breweryName;
    count.textContent = 'Loading beers…';
    list.replaceChildren();
    if (!dialog.open) {
        dialog.showModal();
    }

    const beerData = await fetchJsonData(beerJsonUrl);
    const beers = (beerData || [])
        .filter((beer) => beer.Brewery === breweryName)
        .sort((a, b) => Number(b['My Rating']) - Number(a['My Rating']) || textCollator.compare(a.Beer, b.Beer));

    count.textContent = `${beers.length} rated ${beers.length === 1 ? 'beer' : 'beers'}`;
    if (!beers.length) {
        const empty = document.createElement('p');
        empty.className = 'table-loading';
        empty.textContent = 'No rated beers available.';
        list.appendChild(empty);
        return;
    }
    const fragment = document.createDocumentFragment();
    beers.forEach((beer) => fragment.appendChild(createBeerDetail(beer)));
    list.appendChild(fragment);
}

async function loadSiteStats() {
    const pizzeriaTotal = document.getElementById('pizzeria-total');
    const beerTotal = document.getElementById('beer-total');
    if (!pizzeriaTotal && !beerTotal) {
        return;
    }
    const [pizzaData, beerData] = await Promise.all([
        fetchJsonData(pizzaGeoJsonUrl),
        fetchJsonData(beerJsonUrl)
    ]);
    if (pizzeriaTotal && pizzaData?.features) {
        pizzeriaTotal.textContent = pizzaData.features.length.toLocaleString();
    }
    if (beerTotal && beerData) {
        beerTotal.textContent = beerData.length.toLocaleString();
    }
}

async function loadTables() {
    if (document.getElementById('breweryTable')) {
        const breweryData = await fetchJsonData(breweryJsonUrl);
        buildHtmlTable(breweryData, 'breweryTable', { imageColumn: 'Logo' });
    }

    if (document.getElementById('beerTable')) {
        const beerData = await fetchJsonData(beerJsonUrl);
        buildHtmlTable(beerData, 'beerTable', { imageColumn: 'Label' });
    }

    if (document.getElementById('pizzeriaTable')) {
        const pizzaData = await fetchJsonData(pizzaGeoJsonUrl);
        if (pizzaData?.features) {
            const rows = pizzaData.features.map((feature) => ({
                ...feature.properties,
                Image: feature.properties.Image
                    ? siteAssetUrl(`images/${feature.properties.Image}`)
                    : ''
            }));
            buildHtmlTable(rows, 'pizzeriaTable', {
                imageColumn: 'Image',
                initialSort: { key: 'Date', direction: 'desc' }
            });
        }
    }
}

function createPizzeriaPopup(feature) {
    const properties = feature.properties;
    const popup = document.createElement('article');
    popup.className = 'map-popup';
    const title = document.createElement('h2');
    title.textContent = properties.Pizzeria;
    const meta = document.createElement('p');
    meta.className = 'map-popup-meta';
    meta.textContent = [
        `Rating ${properties.Rating}`,
        properties.Style,
        properties.State,
        properties.Date ? formatDate(properties.Date) : ''
    ].filter(Boolean).join(' · ');
    popup.append(title, meta);

    if (properties.Notes) {
        const notes = document.createElement('p');
        notes.className = 'map-popup-notes';
        notes.textContent = properties.Notes;
        popup.appendChild(notes);
    }

    if (properties.Image) {
        const imageUrl = siteAssetUrl(`images/${properties.Image}`);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'map-popup-image';
        button.setAttribute('aria-label', `Expand photo of ${properties.Pizzeria}`);
        const image = document.createElement('img');
        image.src = imageUrl;
        image.alt = '';
        image.addEventListener('error', () => button.remove());
        button.appendChild(image);
        button.addEventListener('click', () => openPhotoViewer(imageUrl, properties.Pizzeria));
        popup.appendChild(button);
    }
    return popup;
}

function createBreweryPopup(feature, beerData) {
    const breweryName = feature.properties['Brewery Name'];
    const beers = (beerData || [])
        .filter((beer) => beer.Brewery === breweryName)
        .sort((a, b) => Number(b['My Rating']) - Number(a['My Rating']));
    const popup = document.createElement('article');
    popup.className = 'map-popup brewery-map-popup';
    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'map-popup-title-button';
    title.textContent = breweryName;
    title.addEventListener('click', () => openBreweryViewer(breweryName));
    const count = document.createElement('p');
    count.className = 'map-popup-meta';
    count.textContent = `${beers.length} rated ${beers.length === 1 ? 'beer' : 'beers'} · Select brewery for details`;
    const list = document.createElement('div');
    list.className = 'map-beer-list';

    beers.slice(0, 8).forEach((beer) => {
        const item = document.createElement('div');
        item.className = 'map-beer-item';
        if (beer.Label) {
            const image = document.createElement('img');
            image.src = beer.Label;
            image.alt = '';
            image.addEventListener('error', () => image.remove());
            item.appendChild(image);
        }
        const copy = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = beer.Beer;
        const rating = document.createElement('span');
        rating.textContent = `My rating ${beer['My Rating']}`;
        copy.append(name, rating);
        item.appendChild(copy);
        list.appendChild(item);
    });
    popup.append(title, count, list);
    return popup;
}

async function initializeMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement || !globalThis.L) {
        return;
    }

    const map = L.map('map', { zoomControl: false, maxZoom: 20 });
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        {
            subdomains: 'abcd',
            maxZoom: 20,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }
    ).addTo(map);
    map.setView([34.8, -96], 4);

    const customIconPizza = L.icon({
        iconUrl: siteAssetUrl('images/icon_pizza.png'),
        iconSize: [32, 32],
        iconAnchor: [16, 32]
    });
    const customIconBeer = L.icon({
        iconUrl: siteAssetUrl('images/icon_beer.png'),
        iconSize: [32, 32],
        iconAnchor: [16, 32]
    });
    const clusterOptions = {
        maxClusterRadius: 25,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: false
    };
    const pizzeriaCluster = L.markerClusterGroup({
        ...clusterOptions,
        iconCreateFunction: () => L.icon({
            iconUrl: siteAssetUrl('images/icon_pizza.png'),
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        })
    });
    const breweryCluster = L.markerClusterGroup({
        ...clusterOptions,
        iconCreateFunction: () => L.icon({
            iconUrl: siteAssetUrl('images/icon_beer.png'),
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        })
    });

    const legend = L.control({ position: 'topleft' });
    legend.onAdd = function createLegend() {
        const container = L.DomUtil.create('div', 'info legend-container');
        container.innerHTML = '<h2>Layers</h2>' +
            '<div><label><input type="checkbox" id="brewery-checkbox" checked> Breweries</label></div>' +
            '<div><label><input type="checkbox" id="pizzeria-checkbox" checked> Pizzerias</label></div>';
        L.DomEvent.disableClickPropagation(container);
        return container;
    };
    legend.addTo(map);

    const [pizzaData, breweryData, beerData] = await Promise.all([
        fetchJsonData(pizzaGeoJsonUrl),
        fetchJsonData(breweryGeoJsonUrl),
        fetchJsonData(beerJsonUrl)
    ]);

    pizzaData?.features.forEach((feature) => {
        if (!feature.geometry?.coordinates) {
            return;
        }
        const [longitude, latitude] = feature.geometry.coordinates;
        const marker = L.marker([latitude, longitude], { icon: customIconPizza })
            .bindPopup(createPizzeriaPopup(feature), { className: 'mypopup', maxWidth: 340 });
        pizzeriaCluster.addLayer(marker);
    });

    breweryData?.features.forEach((feature) => {
        if (!feature.geometry?.coordinates) {
            return;
        }
        const [longitude, latitude] = feature.geometry.coordinates;
        const marker = L.marker([latitude, longitude], { icon: customIconBeer })
            .bindPopup(createBreweryPopup(feature, beerData), { className: 'mypopup', maxWidth: 360 });
        breweryCluster.addLayer(marker);
    });

    [breweryCluster, pizzeriaCluster].forEach((cluster) => {
        cluster.on('clusterclick', (event) => {
            map.flyTo(event.latlng, Math.min(map.getZoom() + 2, 14), {
                duration: 0.5,
                easeLinearity: 0.1
            });
        });
        map.addLayer(cluster);
    });

    document.getElementById('pizzeria-checkbox')?.addEventListener('change', function togglePizzerias() {
        this.checked ? map.addLayer(pizzeriaCluster) : map.removeLayer(pizzeriaCluster);
    });
    document.getElementById('brewery-checkbox')?.addEventListener('change', function toggleBreweries() {
        this.checked ? map.addLayer(breweryCluster) : map.removeLayer(breweryCluster);
    });
}

loadSiteStats();
loadTables();
initializeMap();
