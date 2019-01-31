import Interval from "../utils/interval";

/**
 * Abstract base class for tracks
 */
export default class Track {

    /**
     * @param {import("../genomeSpy").default} genomeSpy 
     * @param {HTMLElement} trackContainer 
     */
    initialize(genomeSpy, trackContainer) {
        this.genomeSpy = genomeSpy;
        this.trackContainer = trackContainer;
    }

    /**
     * Returns the minimum width that accommodates the labels on the Y axis.
     * The axis area of sampleTrack contains sample labels and sample-specific
     * variables.
     * 
     * @returns {number} The width
     */
    getMinAxisWidth() {
        return 0;
    }

    createCanvas() {
        const canvas = document.createElement("canvas");
        canvas.style.position = "absolute";
        this.trackContainer.appendChild(canvas);
        return canvas;
    }

    adjustCanvas(canvas, interval) {
        const r = window.devicePixelRatio || 1;

        const trackHeight = this.trackContainer.clientHeight;

        const px = x => `${x}px`;
        canvas.style.left = px(interval.lower);
        canvas.style.width = px(interval.width());
        canvas.style.height = px(trackHeight);

        canvas.width = interval.width() * r;
        canvas.height = trackHeight * r;
    }

    get2d(canvas) {
        const r = window.devicePixelRatio || 1;
        const ctx = canvas.getContext("2d");
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.scale(r, r);
        return ctx;
    }

    getViewportDomain() {
        // Could be in GenomeSpy too ... TODO: Decide
        return Interval.fromArray(this.genomeSpy.getVisibleDomain());
    }

    /**
     * Returns an interval that matches the search string
     * 
     * @param {string} string What to search
     */
    search(string) {
        return null;
    }
}