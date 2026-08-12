(function initializeDoughCalculator(global) {
    'use strict';

    const GRAMS_IN_OUNCE = 28.3495;
    const ingredients = [
        { key: 'flour', label: 'Flour' },
        { key: 'water', label: 'Water' },
        { key: 'salt', label: 'Salt' },
        { key: 'yeast', label: 'Yeast' },
        { key: 'oliveOil', label: 'Olive oil', optional: true },
        { key: 'sugar', label: 'Sugar', optional: true },
        { key: 'malt', label: 'Diastatic malt powder', optional: true }
    ];

    function finiteNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    function recipeIngredients(percentages) {
        return ingredients.filter(({ key, optional }) => !optional || percentages[key] > 0);
    }

    // Establish a per-ball ounce factor, total the baker's percentages, then solve for flour.
    function calculateDough(values) {
        const doughBalls = Math.max(1, finiteNumber(values.doughBalls));
        let singleBallOunces;

        if (values.approach === 'weight') {
            singleBallOunces = finiteNumber(values.ballWeight) / GRAMS_IN_OUNCE;
        } else {
            const area = values.shape === 'rectangular'
                ? finiteNumber(values.panLength) * finiteNumber(values.panWidth)
                : Math.PI * Math.pow(finiteNumber(values.diameter) / 2, 2);
            singleBallOunces = area * finiteNumber(values.thicknessFactor);
        }

        const percentages = {
            flour: 100,
            water: finiteNumber(values.hydration),
            salt: finiteNumber(values.salt),
            yeast: finiteNumber(values.yeast),
            oliveOil: finiteNumber(values.oliveOil),
            sugar: finiteNumber(values.sugar),
            malt: finiteNumber(values.malt)
        };
        const totalPercent = Object.values(percentages).reduce((sum, percent) => sum + percent, 0);
        const flourOunces = singleBallOunces * doughBalls * (100 / totalPercent);
        const ingredientWeights = {};

        ingredients.forEach(({ key }) => {
            ingredientWeights[key] = flourOunces * (percentages[key] / 100);
        });

        const totalOunces = Object.values(ingredientWeights).reduce((sum, ounces) => sum + ounces, 0);
        return {
            doughBalls,
            totalPercent,
            totalOunces,
            ballOunces: totalOunces / doughBalls,
            percentages,
            ingredientWeights
        };
    }

    global.DoughCalculatorMath = {
        GRAMS_IN_OUNCE,
        calculateDough,
        recipeIngredients
    };

    if (typeof document === 'undefined') {
        return;
    }

    const form = document.getElementById('dough-form');
    if (!form) {
        return;
    }

    const recipeRows = document.getElementById('recipe-rows');
    const ballCount = document.getElementById('ball-count');
    const ballLabel = document.getElementById('ball-label');
    const ballTotal = document.getElementById('ball-total');
    const recipeSummary = document.getElementById('recipe-summary');
    const totalPercent = document.getElementById('total-percent');
    const totalWeight = document.getElementById('total-weight');
    const calculatorError = document.getElementById('calculator-error');
    const copyButton = document.getElementById('copy-recipe');
    const resetButton = document.getElementById('reset-recipe');
    const copyStatus = document.getElementById('copy-status');
    let latestResult = null;

    function selectedValue(name) {
        return form.elements[name].value;
    }

    function readValues() {
        return {
            approach: selectedValue('approach'),
            shape: selectedValue('shape'),
            doughBalls: form.elements.doughBalls.value,
            diameter: form.elements.diameter.value,
            panLength: form.elements.panLength.value,
            panWidth: form.elements.panWidth.value,
            thicknessFactor: form.elements.thicknessFactor.value,
            ballWeight: form.elements.ballWeight.value,
            hydration: form.elements.hydration.value,
            salt: form.elements.salt.value,
            yeast: form.elements.yeast.value,
            oliveOil: form.elements.oliveOil.value,
            sugar: form.elements.sugar.value,
            malt: form.elements.malt.value
        };
    }

    function formatNumber(value, maximumFractionDigits = 2) {
        return new Intl.NumberFormat(undefined, {
            maximumFractionDigits,
            minimumFractionDigits: 0
        }).format(value);
    }

    function formatWeight(ounces) {
        const grams = ounces * GRAMS_IN_OUNCE;
        return `${formatNumber(grams, grams < 10 ? 2 : 1)} g`;
    }

    function recipeDescription(values) {
        if (values.approach === 'weight') {
            return `${formatNumber(finiteNumber(values.ballWeight), 1)} g target per ball`;
        }
        const size = values.shape === 'round'
            ? `${formatNumber(finiteNumber(values.diameter), 1)} in round`
            : `${formatNumber(finiteNumber(values.panLength), 1)} × ${formatNumber(finiteNumber(values.panWidth), 1)} in`;
        return `${size} · ${formatNumber(finiteNumber(values.thicknessFactor), 3)} thickness`;
    }

    function isValid(values, result) {
        const percentagesAreValid = ['hydration', 'salt', 'yeast', 'oliveOil', 'sugar', 'malt']
            .every((key) => finiteNumber(values[key]) >= 0);
        const sizeIsValid = values.approach === 'weight'
            ? finiteNumber(values.ballWeight) > 0
            : finiteNumber(values.thicknessFactor) > 0
                && (values.shape === 'round'
                    ? finiteNumber(values.diameter) > 0
                    : finiteNumber(values.panLength) > 0 && finiteNumber(values.panWidth) > 0);
        return percentagesAreValid
            && finiteNumber(values.doughBalls) >= 1
            && sizeIsValid
            && Number.isFinite(result.totalOunces)
            && result.totalOunces > 0;
    }

    function renderRecipe() {
        const values = readValues();
        const result = calculateDough(values);
        const valid = isValid(values, result);
        latestResult = valid ? { values, result } : null;

        calculatorError.hidden = valid;
        recipeRows.hidden = !valid;
        document.querySelector('.recipe-total-row').hidden = !valid;
        copyButton.disabled = !valid;

        ballCount.textContent = formatNumber(result.doughBalls, 0);
        ballLabel.textContent = result.doughBalls === 1 ? 'ball' : 'balls';
        recipeSummary.textContent = recipeDescription(values);

        if (!valid) {
            ballTotal.textContent = '—';
            return;
        }

        ballTotal.textContent = formatWeight(result.ballOunces);
        totalPercent.textContent = `${formatNumber(result.totalPercent, 2)}%`;
        totalWeight.textContent = formatWeight(result.totalOunces);

        recipeRows.replaceChildren();
        const fragment = document.createDocumentFragment();
        recipeIngredients(result.percentages).forEach(({ key, label }) => {
            const row = document.createElement('div');
            row.className = `recipe-row recipe-row--${key}`;
            row.setAttribute('role', 'row');
            row.innerHTML = `<span role="cell">${label}</span><span role="cell">${formatNumber(result.percentages[key], 2)}%</span><span role="cell"><strong>${formatWeight(result.ingredientWeights[key])}</strong></span>`;
            fragment.appendChild(row);
        });
        recipeRows.appendChild(fragment);
    }

    function syncPanels() {
        const approach = selectedValue('approach');
        const shape = selectedValue('shape');
        document.querySelectorAll('[data-approach-panel]').forEach((panel) => {
            panel.hidden = panel.dataset.approachPanel !== approach;
        });
        document.querySelectorAll('[data-shape-panel]').forEach((panel) => {
            panel.hidden = panel.dataset.shapePanel !== shape;
        });
    }

    function recipeAsText() {
        if (!latestResult) {
            return '';
        }
        const { values, result } = latestResult;
        const lines = [
            'Pizza dough recipe',
            `${formatNumber(result.doughBalls, 0)} ${result.doughBalls === 1 ? 'ball' : 'balls'} × ${formatWeight(result.ballOunces)}`,
            recipeDescription(values),
            ''
        ];
        recipeIngredients(result.percentages).forEach(({ key, label }) => {
            lines.push(`${label}: ${formatWeight(result.ingredientWeights[key])} (${formatNumber(result.percentages[key], 2)}%)`);
        });
        lines.push('', `Total dough: ${formatWeight(result.totalOunces)}`);
        return lines.join('\n');
    }

    async function copyRecipe() {
        const text = recipeAsText();
        if (!text) {
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            copyStatus.textContent = 'Recipe copied.';
        } catch (error) {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.setAttribute('readonly', '');
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            textArea.remove();
            copyStatus.textContent = 'Recipe copied.';
        }
        window.setTimeout(() => {
            copyStatus.textContent = '';
        }, 2200);
    }

    form.addEventListener('input', renderRecipe);
    form.addEventListener('change', () => {
        syncPanels();
        renderRecipe();
    });
    copyButton.addEventListener('click', copyRecipe);
    resetButton.addEventListener('click', () => {
        form.reset();
        copyStatus.textContent = '';
        syncPanels();
        renderRecipe();
    });

    syncPanels();
    renderRecipe();
}(globalThis));
