import {
    isString,
    isNumber,
    panLinear,
    zoomLinear,
    clampRange,
    span
} from "vega-util";
import { isDiscrete, isContinuous } from "vega-scale";

import mergeObjects from "../utils/mergeObjects";
import createScale from "../scale/scale";

import { SHAPES } from "../marks/pointMark"; // TODO: Fix silly dependency
import { SQUEEZE } from "../marks/rectMark"; // TODO: Fix silly dependency
import { getCachedOrCall } from "../utils/propertyCacher";

/**
 * Resolution takes care of merging domains and scales from multiple views.
 * This class also provides some utility methods for zooming the scales etc..
 *
 * @typedef {import("../utils/domainArray").DomainArray} DomainArray
 * @typedef {import("../utils/interval").default} Interval
 * @typedef { import("./unitView").default} UnitView
 */
export default class ScaleResolution {
    /**
     * @param {string} channel
     */
    constructor(channel) {
        this.channel = channel;
        /** @type {import("./unitView").default[]} The involved views */
        this.views = [];
        /** @type {string} Data type (quantitative, nominal, etc...) */
        this.type = null;

        /** @type {Set<function():void>} Observers that are called when the scale domain is changed */
        this.scaleObservers = new Set();
    }

    /**
     * Adds an observer that is called when the scale domain is changed,
     * e.g., zoomed.
     *
     * @type {function():void} callback function
     */
    addScaleObserver(observer) {
        this.scaleObservers.add(observer);
    }

    removeScaleObserver(observer) {
        this.scaleObservers.delete(observer);
    }

    _notifyScaleObservers() {
        for (const observer of this.scaleObservers.values()) {
            observer();
        }
    }

    /**
     * N.B. This is expected to be called in depth-first order
     *
     * @param {UnitView} view
     */
    pushUnitView(view) {
        const type = this._getEncoding(view).type;
        if (!this.type) {
            this.type = type;
        } else if (type !== this.type) {
            // TODO: Include a reference to the layer
            throw new Error(
                `Can not use shared scale for different data types: ${this.type} vs. ${type}. Use "resolve: independent" for channel ${this.channel}`
            );
            // Actually, point scale could be changed into band scale
        }

        this.views.push(view);
    }

    /**
     * Returns true if the domain has been defined explicitly, i.e. not extracted from the data.
     */
    isExplicitDomain() {
        if (this._explicitDomain) {
            return true;
        }

        for (const view of this.views) {
            const scale = this._getEncoding(view).scale;
            return scale && Array.isArray(scale.domain);
        }
        return false;
    }

    getScaleProps() {
        return getCachedOrCall(this, "scaleProps", () => {
            const propArray = this.views.map(
                view => this._getEncoding(view).scale
            );

            // TODO: Disabled scale: https://vega.github.io/vega-lite/docs/scale.html#disable
            return /** @type { import("../spec/scale").Scale} */ (mergeObjects(
                propArray.filter(props => props !== undefined),
                "scale",
                ["domain"]
            ));
        });
    }

    /**
     * Set an explicit domain that overrides all other configurations and
     * computed domains
     *
     * @param {DomainArray} domain
     */
    setDomain(domain) {
        this._explicitDomain = domain;
        this._scale = undefined;
    }

    /**
     * Unions the domains (explicit or extracted) of all participating views
     *
     * @return { DomainArray }
     */
    getDataDomain() {
        if (this._explicitDomain) {
            return this._explicitDomain;
        }

        // TODO: Optimize: extract domain only once if the views share the data
        return this.views
            .map(view => view.getDomain(this.channel))
            .filter(domain => !!domain)
            .reduce((acc, curr) => acc.extendAll(curr));
    }

    /**
     * Returns the domain of the scale
     */
    getDomain() {
        return this.getScale()?.domain();
    }

    /**
     * @returns {import("../encoder/encoder").VegaScale}
     */
    getScale() {
        if (this._scale) {
            return this._scale;
        }

        const domain = this.getDataDomain();

        // TODO: Use scaleLocus if field type is locus
        const props = {
            type: getDefaultScaleType(this.channel, domain.type),
            ...this._getDefaultScaleProperties(domain.type),
            ...this.getScaleProps(),
            domain,
            ...getLockedScaleProperties(this.channel)
        };

        // Swap discrete y axis
        if (this.channel == "y" && isDiscrete(props.type)) {
            props.range = [props.range[1], props.range[0]];
        }

        if (props.range && props.scheme) {
            delete props.scheme;
            // TODO: Settings should be set more intelligently
            /*
            throw new Error(
                `Scale has both "range" and "scheme" defined! Views: ${this._getViewPaths()}`
            );
            */
        }

        this._scale = createScale(props);
        if (this._scale.type == "locus") {
            this._configureGenome();
        }

        // Tag the scale and inform encoders and shaders that emulated
        // 64bit floats should be used.
        // N.B. the tag is lost upon scale.clone().
        this._scale.fp64 = !!props.fp64;

        // Can be used as zoom extent
        this._originalDomain = [...this._scale.domain()];

        return this._scale;
    }

    isZoomable() {
        //return isContinuous(this.getScale().type);
        if (this.channel != "x" && this.channel != "y") {
            return false;
        }

        const scaleType = this.getScale().type;
        if (!["linear", "locus", "index"].includes(scaleType)) {
            return false;
        }

        // Check explicit configuration
        const props = this.getScaleProps();
        if ("zoom" in props) {
            return !!props.zoom;
        }

        // By default, index and locus scales are zoomable, others are not
        return ["index", "locus"].includes(scaleType);
    }

    /**
     *
     * @param {number} scaleFactor
     * @param {number} scaleAnchor
     * @param {number} pan
     * @returns {boolean} true if the scale was zoomed
     */
    zoom(scaleFactor, scaleAnchor, pan) {
        if (!this.isZoomable()) {
            return false;
        }

        const scale = this.getScale();
        const oldDomain = scale.domain();
        let newDomain = [...oldDomain];

        // TODO: log, pow, symlog, ...
        newDomain = panLinear(newDomain, pan || 0);
        newDomain = zoomLinear(
            newDomain,
            scale.invert(scaleAnchor),
            scaleFactor
        );

        newDomain = clampRange(newDomain, ...this._originalDomain);

        if ([0, 1].some(i => newDomain[i] != oldDomain[i])) {
            scale.domain(newDomain);
            this._notifyScaleObservers();
            return true;
        }

        return false;
    }

    /**
     * Returns the zoom level with respect to the reference domain span (the original domain).
     *
     * TODO: This is highly specific to positional channels. Figure out a better place for this
     * and other zoom-related stuff.
     */
    getZoomLevel() {
        if (this.isZoomable()) {
            return span(this._originalDomain) / span(this.getScale().domain());
        }

        return 1.0;
    }

    /**
     *
     * @param {UnitView} view
     */
    _getEncoding(view) {
        return view.getEncoding()[this.channel];
    }

    /**
     * TODO: These actually depend on the mark, so this is clearly a wrong place.
     * And besides, these should be configurable (themeable)
     *
     * @param {string} dataType
     */
    _getDefaultScaleProperties(dataType) {
        const channel = this.channel;
        const props = {};

        if (this.isExplicitDomain()) {
            props.zero = false;
        }

        if (channel == "y" || channel == "x") {
            props.nice = !this.isExplicitDomain();
        } else if (channel == "color") {
            // TODO: Named ranges
            props.scheme =
                dataType == "nominal"
                    ? "tableau10"
                    : dataType == "ordinal"
                    ? "blues"
                    : "viridis";
        } else if (channel == "shape") {
            // of point mark
            props.range = Object.keys(SHAPES);
        } else if (channel == "squeeze") {
            // of rect mark
            props.range = Object.keys(SQUEEZE);
        } else if (channel == "size") {
            props.range = [0, 400]; // TODO: Configurable default. This is currently optimized for points.
        }

        return props;
    }

    _configureGenome() {
        // Aargh what a hack
        const cm = /** @type {import("../genome/genome").default}*/ (this
            .views[0].context.genomeSpy.coordinateSystem).chromMapper;
        /** @type {import("../genome/scaleLocus").default} */ (this._scale).chromMapper(
            cm
        );
    }

    _getViewPaths() {
        return this.views.map(v => v.getPathString()).join(", ");
    }
}

/**
 *
 * @param {string} channel
 * @param {string} dataType
 */
function getDefaultScaleType(channel, dataType) {
    // TODO: Band scale, Bin-Quantitative

    if (["index", "locus"].includes(dataType)) {
        if ("xy".includes(channel)) {
            return dataType;
        } else {
            // TODO: Also explicitly set scales should be validated
            throw new Error(
                `${channel} does not support ${dataType} data type. Only positional channels do.`
            );
        }
    }

    /** @type {Object.<string, string[]>} [nominal/ordinal, quantitative]*/
    const defaults = {
        x: ["band", "linear"],
        y: ["band", "linear"],
        size: ["point", "linear"],
        opacity: ["point", "linear"],
        color: ["ordinal", "linear"],
        shape: ["ordinal", null], // TODO: Perhaps some discretizing quantitative scale?
        squeeze: ["ordinal", null],
        sample: ["identity", "identity"],
        semanticScore: [null, "identity"],
        text: ["identity", "identity"],
        dx: [null, "identity"],
        dy: [null, "identity"]
    };

    return defaults[channel]
        ? defaults[channel][dataType == "quantitative" ? 1 : 0]
        : dataType == "quantitative"
        ? "linear"
        : "ordinal";
}

/**
 * Properties that are always overriden
 *
 * @param {string} channel
 */
function getLockedScaleProperties(channel) {
    /** @type {Object.<string, any>} */
    const locked = {
        x: { range: [0, 1] },
        y: { range: [0, 1] }
    };

    return locked[channel] || {};
}
