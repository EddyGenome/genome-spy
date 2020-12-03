import numberExtractor from "../../utils/numberExtractor";
import FlowNode from "../flow/flowNode";

/**
 * @typedef {object} FlattenExonsConfig
 * @prop {string} exons
 * @prop {string} startpos
 * @prop {string[]} as
 */

/**
 * Flattens "run-length encoded" exons. The transforms inputs the start
 * coordinate of the gene body and a comma-delimited string of alternating
 * exon and intron lengths. A new row is created for each exon.
 */
export default class FlattenCompressedExonsTransform extends FlowNode {
    /**
     *
     * @param {FlattenExonsConfig} config
     */
    constructor(config) {
        super();

        const exons = config.exons || "exons";
        const startpos = config.startpos || "start";
        const [exonStart, exonEnd] = config.as || ["exonStart", "exonEnd"];

        /**
         *
         * @param {any} datum
         */
        this.handle = datum => {
            let upper = datum[startpos];
            let lower = upper;

            let inExon = true;
            for (const token of numberExtractor(datum[exons])) {
                if (inExon) {
                    lower = upper + token;
                } else {
                    upper = lower + token;

                    // Use the original row as a prototype
                    const newRow = Object.create(datum);
                    newRow[exonStart] = lower;
                    newRow[exonEnd] = upper;

                    this._propagate(newRow);
                }

                inExon = !inExon;
            }
        };
    }
}
