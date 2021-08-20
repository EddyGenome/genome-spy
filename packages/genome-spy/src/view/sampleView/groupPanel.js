import { range } from "d3-array";
import { peek } from "../../utils/arrayUtils";
import { invalidatePrefix } from "../../utils/propertyCacher";
import LayerView from "../layerView";

/**
 * @typedef {import("./sampleView").Sample} Sample
 * @typedef {import("../view").default} View
 *
 */
export class GroupPanel extends LayerView {
    /**
     * @param {import("./sampleView").default} sampleView
     */
    constructor(sampleView) {
        super(
            {
                width: { step: 22 },
                // TODO: Make step size, colors, font size, etc. configurable.

                data: { dynamicSource: true },

                transform: [
                    { type: "filter", expr: "datum._depth > 0" },
                    { type: "formula", as: "_y1", expr: "datum._index * 2" },
                    {
                        type: "formula",
                        as: "_y2",
                        expr: "datum._index * 2 + 1"
                    },
                    {
                        type: "formula",
                        as: "_NA",
                        expr: "datum.label == null"
                    },
                    {
                        type: "formula",
                        as: "label",
                        expr: "datum.label != null ? datum.label: 'NA'"
                    }
                ],

                encoding: {
                    x: {
                        field: "_depth",
                        type: "ordinal",
                        scale: {
                            align: 0,
                            padding: 0.2272727
                        },
                        /*
                        axis: {
                            title: null
                            domain: false
						}
						*/
                        axis: null
                    },
                    // "Abuse" the ordinal scale on a positional channel.
                    // Its range encodes the positions of the groups and it is updated dynamically
                    // when the samples are peeked and scrolled.
                    y: {
                        field: "_y1",
                        type: "nominal",
                        scale: {
                            type: "ordinal",
                            domain: range(500) // Hack needed because domains are not (yet) sorted
                        },
                        axis: null
                    },
                    y2: { field: "_y2" }
                },
                layer: [
                    {
                        title: "Group",
                        mark: {
                            type: "rect",
                            clip: true,
                            dynamicData: true,
                            color: "#e8e8e8"
                        }
                    },
                    {
                        mark: {
                            type: "text",
                            clip: true,
                            dynamicData: true,
                            angle: -90,
                            paddingY: 5,
                            tooltip: null
                        },
                        encoding: {
                            text: { field: "label", type: "nominal" },
                            opacity: {
                                field: "_NA",
                                type: "nominal",
                                scale: {
                                    type: "ordinal",
                                    domain: [false, true],
                                    range: [1.0, 0.3]
                                }
                            }
                        }
                    }
                ]
            },
            sampleView.context,
            undefined,
            "sampleGroups"
        );

        this.sampleView = sampleView;
        this.groupLocations = undefined;
    }

    updateRange() {
        if (!this.groupLocations?.length) {
            return;
        }

        const viewHeight = this.sampleView?._coords.height ?? 0; // Fugly!!

        const yRes = this.getScaleResolution("y");

        /** @type {number[]} */
        const yRange = [];

        for (const g of this.groupLocations) {
            yRange.push(1 - (g.locSize.location + g.locSize.size) / viewHeight);
            yRange.push(1 - g.locSize.location / viewHeight);
        }

        yRes.getScale().range(yRange);
        // TODO: The texture should be updated implicitly when the range is modified
        this.context.glHelper.createRangeTexture(yRes, true);
    }

    /**
     *
     * @param {import("./sampleViewTypes").HierarchicalGroupLocation[]} groupLocations
     */
    updateGroups(groupLocations) {
        const dynamicSource = /** @type {import("../../data/sources/dynamicSource").default} */ (this.context.dataFlow.findDataSourceByKey(
            this
        ));

        this.groupLocations = groupLocations;

        const data = groupLocations.map(g => ({
            _index: g.key.index,
            _name: g.key.group.name,
            _depth: g.key.depth,
            attribute: g.key.attributeLabel,
            label: g.key.group.label,
            n: g.key.n
        }));

        dynamicSource.publishData(data);

        // TODO: Get rid of the following. Should happen automatically:
        this.getScaleResolution("x").reconfigure();
        this.getScaleResolution("y").reconfigure();

        this.updateRange();

        // TODO: Get rid of the following. Should happen automatically:
        peek([...this.getAncestors()]).visit(view =>
            invalidatePrefix(view, "size")
        );
    }
}
