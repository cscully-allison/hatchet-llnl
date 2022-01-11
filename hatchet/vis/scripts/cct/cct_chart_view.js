import { d3, globals } from "./cct_globals";
import makeColorManager from "./cct_color_manager";
import View from "../utils/view";
import { selection } from "d3v4";

class ChartView extends View{

    constructor(elem, model){
        super(elem, model);
        this._colorManager = makeColorManager(model);

        //layout variables
        this._margin = globals.layout.margin;     
        this._width = element.clientWidth - this._margin.right - this._margin.left;
        this._height = this._margin.top + this._margin.bottom;
        this._maxNodeRadius = 20;
        this._treeLayoutHeights = [];
        this.legendOffset = 0;
        this.chartOffset = this._margin.top;
        this.treeOffset = 0;
        this._minmax = [];

        this.svg = d3.select(elem)
                    .append('svg')
                    .attr("class", "canvas")
                    .attr("width", this._width)
                    .attr("height", this._height);

        //scales
        this._treeCanvasHeightScale = d3.scaleQuantize().range([250, 1000, 1250, 1500]).domain([1, 300]);
        this._treeDepthScale = d3.scaleLinear().range([0, element.offsetWidth-200]).domain([0, model.data.maxHeight])
        this._nodeScale = d3.scaleLinear().range([5, this._maxNodeRadius]).domain([model.data.forestMinMax[model.state.secondaryMetric].min, model.data.forestMinMax[model.state.secondaryMetric].max]);
        this._barScale = d3.scaleLinear().range([5, 25]).domain([model.data.forestMinMax[model.state.secondaryMetric].min, model.data.forestMinMax[model.state.secondaryMetric].max]);

        //view specific data stores
        this.nodes = [];
        this.surrogates = [];
        this.aggregates = [];
        this.links = [];
        this.metricColumns = model.data["metricColumns"];
        this.attributeColumns = model.data["attributeColumns"];

        this._preRender();
    }


    diagonal(s, d, ti) {
        /**
         * Creates a curved diagonal path from parent to child nodes
         * 
         * @param {Object} s - parent node
         * @param {Object} d - child node
         * 
         */
        var dy = this._treeDepthScale(d.depth);
        var sy = this._treeDepthScale(s.depth);
        var sx = this._getLocalNodeX(s.x, ti);
        var dx = this._getLocalNodeX(d.x, ti);
        let path = `M ${sy} ${sx}
        C ${(sy + dy) / 2} ${sx},
        ${(sy + dy) / 2} ${dx},
        ${dy} ${dx}`

        return path
    }

    _getLocalNodeX(x, ti){
        /**
         * Returns the local node x offset based on the current
         * tree layout.
         * 
         * @param {float} x - X offset of a node from d3.tree
         * @param {Number} ti - The current tree index
         */
        return x + this.treeOffset - this._minmax[ti].min;
    }

    _getMinxMaxxFromTree(root){
        /**
         * Get the minimum x value and maximum x value from a tree layout
         * Used for calculating canvas offsets before drawing
         * 
         * @param {Object} root - The root node of the working tree
         */

        var obj = {}
        var min = Infinity;
        var max = -Infinity;
        root.descendants().forEach((d) => {
            max = Math.max(d.x, max);
            min = Math.min(d.x, min);
        })

        obj.min = min;
        obj.max = max;

        return obj;
    }

    _getHeightFromTree(root){
        /**
         * Get the vertical space required to draw the tree
         * by subtracting the min x value from the maximum
         * 
         * @param {Object} root - The root node of the working tree
         */
        let minmax = this._getMinxMaxxFromTree(root);
        let min = minmax["min"];
        let max = minmax["max"];

        return max - min;
    }
    
    _getSelectedNodes(selection){
        /**
         * Function which calculates the collison of which nodes were brushed
         * 
         * @param {Array} selection - A 2d array containing the svg coordinates of the top left and bottom right
         *  points of a brushed bounding box
         */
        let brushedNodes = [];
        if (selection){
            for(var i = 0; i < this.model.data["numberOfTrees"]; i++){
                this.nodes[i].forEach((d) => {
                    if(selection[0][0] <= d.yMainG && selection[1][0] >= d.yMainG 
                        && selection[0][1] <= d.xMainG && selection[1][1] >= d.xMainG){
                        brushedNodes.push(d);
                    }
                })
            }
        }

        return brushedNodes;

    }

    _calcNodePositions(nodes, treeIndex){
        /**
         * Calculates the local and gloabal node positions for each tree in
         *  our forest.
         * 
         * @param {Array} nodes - An array of all nodes in a tree
         * @param {Number} treeIndex - An integer of the current tree index
         */
        console.log("called");
        nodes.forEach(
            (d) => {
                    d.x0 = this._getLocalNodeX(d.x, treeIndex);
                    d.y0 = this._treeDepthScale(d.depth);
                
                    // Store the overall position based on group
                    d.xMainG = d.x0 + this.chartOffset;
                    d.yMainG = d.y0 + this._margin.left;
            }
        );
    }

    _preRender(){
        //For calls which need the context of
        // the d3 callback and class
        const self = this;

        var mainG = this.svg.append("g")
            .attr('id', "mainG")
            .attr("transform", "translate(" + globals.layout.margin.left + "," + globals.layout.margin.top + ")");
            
            // .nodeSize([this._maxNodeRadius, this._maxNodeRadius]);
        
        
        var zoom = d3.zoom()
            .on("zoom", function (){
                    let zoomObj = d3.select(this).selectAll(".chart");
                    zoomObj.attr("transform", d3.event.transform);
                })
                .on("end", function () {
                    let zoomObj = d3.select(this).selectAll(".chart");
                    let index = zoomObj.attr("chart-id");
                    let transformation = zoomObj.node().getCTM();

                    self.nodes[index].forEach((d) =>  {
                        /**
                         * This function gets the absolute location for each point based on the relative
                         * locations of the points based on transformations
                         * the margins were being added into the .e and .f values so they have to be subtracted
                         * Adapted from: https://stackoverflow.com/questions/18554224/getting-screen-positions-of-d3-nodes-after-transform
                         * 
                         */
                        
                        d.yMainG = transformation.e + d.y0*transformation.d + d.x0*transformation.c - globals.layout.margin.left;
                        d.xMainG = transformation.f + d.y0*transformation.b + d.x0*transformation.a - globals.layout.margin.top;
                    });
                });


        // Add a group and tree for each forestData[i]
        for (var treeIndex = 0; treeIndex < this.model.data.numberOfTrees; treeIndex++) {
            let tree = d3.tree().size([this._treeCanvasHeightScale(this.model.data.hierarchy[treeIndex].size), this._width - this._margin.left - 200]);
            let currentRoot = tree(this.model.data.hierarchy[treeIndex]);
            let currentLayoutHeight = this._getHeightFromTree(currentRoot);
            let currentMinMax = this._getMinxMaxxFromTree(currentRoot);
            
            var newg = mainG.append("g")
                    .attr('class', 'group-' + treeIndex + ' subchart')
                    .attr('tree_id', treeIndex)
                    .attr("transform", "translate(" + this._margin.left + "," + this.chartOffset + ")");

            const legGroup = newg
                .append('g')
                .attr('class', 'legend-grp-' + treeIndex)
                .attr('transform', 'translate(0, 0)');

            const legendGroups = legGroup.selectAll("g")
                    .data([0, 1, 2, 3, 4, 5])
                    .enter()
                    .append('g')
                    .attr('class', 'legend legend' + treeIndex)
                    .attr('transform', (d, i) => {
                        const y = 18 * i;
                        return "translate(-20, " + y + ")";
                    });
            
            //legend rectangles & text
            legendGroups.append('rect')
                    .attr('class', 'legend legend' + treeIndex)
                    .attr('x', 0)
                    .attr('y', 0)
                    .attr('height', 15)
                    .attr('width', 10)
                    .style('stroke', 'black');
            legendGroups.append('text')
                    .attr('class', 'legend legend' + treeIndex)
                    .attr('x', 12)
                    .attr('y', 13)
                    .text("0.0 - 0.0")
                    .style('font-family', 'monospace')
                    .style('font-size', '12px');

            this.legendOffset = legGroup.node().getBBox().height;

            //make an invisible rectangle for zooming on
            newg.append('rect')
                .attr('height', this._treeLayoutHeights[treeIndex])
                .attr('width', this._width)
                .attr('fill', 'rgba(0,0,0,0)');

            //put tree itself into a group
            newg.append('g')
                .attr('class', 'chart')
                .attr('chart-id', treeIndex)
                .attr('height', globals.treeHeight)
                .attr('width', this._width)
                .attr('fill', 'rgba(0,0,0,0)');

            this.treeOffset = 0 + this.legendOffset + this._margin.top;

            newg.style("display", "inline-block");

            //store node and link layout data for use later
            var treeLayout = tree(this.model.data.hierarchy[treeIndex]);
            this.nodes.push(treeLayout.descendants());
            this.surrogates.push([]);
            this.aggregates.push([]);
            this.links.push(treeLayout.descendants().slice(1));
            
            //storage
            this._treeLayoutHeights.push(currentLayoutHeight);
            this._minmax.push(currentMinMax);

            //updates
            // put this on the immutable tree
            this._calcNodePositions(this.nodes[treeIndex], treeIndex);

            this.chartOffset = this._treeLayoutHeights[treeIndex] + this.treeOffset + this._margin.top;
            this._height += this.chartOffset;


            newg.call(zoom)
                .on("dblclick.zoom", null);

        }
        
        //Update the height
        this.svg.attr("height", this._height);

        //setup Interactions
        this.brush = d3.brush()
        .extent([[0, 0], [2 * this._width, 2 * (this._height + globals.layout.margin.top + globals.layout.margin.bottom)]])
        .on('brush', function(){
        })
        .on('end', () => {
            var selection = this._getSelectedNodes(d3.event.selection);
            this.observers.notify({
                type: globals.signals.BRUSH,
                selection: selection
            })
        });
    }


    render(){
        /**
             * Core render function for the chart portion of the view, including legends
             * Called from the model with observers.notify
             * 
             */
        
        const self = this;
        this.chartOffset = this._margin.top;
        this._height = this._margin.top + this._margin.bottom;

        //update scales
        this._nodeScale.domain([0, this.model.data.forestMinMax[this.model.state.secondaryMetric].max]);
        this._barScale.domain([this.model.data.aggregateMinMax[this.model.state.secondaryMetric].min, this.model.data.aggregateMinMax[this.model.state.secondaryMetric].max]);

        //add brush if there should be one
        if(this.model.state.brushOn > 0){
             this.svg.select("#mainG").append('g')
                 .attr('class', 'brush')
                 .call(this.brush);
        } 

        //render for any number of trees
        for(var treeIndex = 0; treeIndex < this.model.data.numberOfTrees; treeIndex++){
            //retrieve new data from model
            var secondaryMetric = this.model.state.secondaryMetric;
            var source = this.model.data.hierarchy[treeIndex];

            //will need to optimize this redrawing
            // by cacheing tree between calls
            if(this.model.state.hierarchyUpdated == true){
                let tree = d3.tree().size([this._treeCanvasHeightScale(this.model.data.hierarchy[treeIndex].size), this._width - this._margin.left - 200]);
                var treeLayout = tree(source);
                this.nodes[treeIndex] = treeLayout.descendants().filter(d=>{return !d.dummy});
                this.surrogates[treeIndex] = treeLayout.descendants().filter(d=>{return (d.dummy && !d.aggregate)});
                this.aggregates[treeIndex] = treeLayout.descendants().filter(d=>{return d.aggregate});
                this.links[treeIndex] = treeLayout.descendants().slice(1);
                
                this._calcNodePositions(this.nodes[treeIndex], treeIndex);

                //recalculate layouts
                this._treeLayoutHeights[treeIndex] = this._getHeightFromTree(treeLayout);
                this._minmax[treeIndex] = this._getMinxMaxxFromTree(treeLayout);

                //only update after last tree
                if(treeIndex == this.model.data.numberOfTrees - 1){
                    this.model.state.hierarchyUpdated = false;
                }
            }

            
            var chart = this.svg.selectAll('.group-' + treeIndex);
            var treeGroup = chart.selectAll('.chart');

            if(this.model.state.resetView == true){
                /**
                 * BUG - D3 TRANSFORM EVENET DOES NOT UPDATE
                 */
                treeGroup.attr("transform", "");

                this.nodes[treeIndex].forEach(
                    (d) =>  {
                        // Store the overall position based on group
                        d.xMainG = d.x0 + this.chartOffset;
                        d.yMainG = d.y0 + this._margin.left;
                    }
                );

                //only update after last tree
                if(treeIndex == this.model.data.numberOfTrees - 1){
                    this.model.state.resetView = false;
                }
            }

            // ---------------------------------------------
            // ENTER 
            // ---------------------------------------------
            var node = treeGroup.selectAll("g.node")
                    .data(this.nodes[treeIndex], (d) =>  {
                        return d.data.metrics._hatchet_nid || d.data.metrics.id;
                    });
            
            var dummyNodes = treeGroup.selectAll("g.fakeNode")
                .data(this.surrogates[treeIndex], (d) =>  {
                    return d.data.metrics._hatchet_nid || d.data.metrics.id;
                });

            var aggBars = treeGroup.selectAll("g.aggBar")
                .data(this.aggregates[treeIndex], (d) =>  {
                    return d.data.metrics._hatchet_nid || d.data.metrics.id;
                });
            
            // Enter any new nodes at the parent's previous position.
            var nodeEnter = node.enter().append('g')
                    .attr('class', 'node')
                    .attr("transform", (d) =>  {
                        if(!d.parent){
                            return "translate(0,0)"
                        }
                        return "translate(" + d.parent.y + "," + d.parent.x + ")";
                    })
                    .on("click", (d) => {
                        console.log(d);
                        this.observers.notify({
                            type: globals.signals.CLICK,
                            node: d
                        })
                    })
                    .on('dblclick', (d) =>  {
                        this.observers.notify({
                            type: globals.signals.DBLCLICK,
                            node: d,
                            tree: treeIndex
                        })
                    });


            var dNodeEnter = dummyNodes.enter().append('g')
                .attr('class', 'fakeNode')
                .on("click", (d) => {
                    this.observers.notify({
                        type: globals.signals.CLICK,
                        node: d
                    })
                })
                .on('dblclick', (d) =>  {
                    this.observers.notify({
                        type: globals.signals.DBLCLICK,
                        node: d
                    })
                });
            
            var aggNodeEnter = aggBars.enter().append('g')
                .attr('class', 'aggBar')
                .attr("transform", (d) =>  {
                    return `translate(${this._treeDepthScale(d.depth)}, ${this._getLocalNodeX(d.x, treeIndex)})`;
                })
                .on("click", (d) => {
                    this.observers.notify({
                        type: globals.signals.CLICK,
                        node: d
                    })
                })
                .on('dblclick', (d) =>  {
                    this.observers.notify({
                        type: globals.signals.DBLCLICK,
                        node: d
                    })
                });
            

            nodeEnter.append("circle")
                    .attr('class', 'circleNode')
                    .attr("r", 1e-6)
                    .style("fill", (d) => {
                        if(this.model.state["legend"] == globals.UNIFIED){
                            return this._colorManager.calcColorScale(d.data, -1);
                        }
                        return this._colorManager.calcColorScale(d.data, treeIndex);
                    })
                    .style('stroke-width', '1px')
                    .style('stroke', 'black');

            dNodeEnter.append("path")
                    .attr('class', 'dummyNode')
                    .attr("d", "M 6 2 C 6 2 5 2 5 3 S 6 4 6 4 S 7 4 7 3 S 6 2 6 2 Z M 6 3 S 6 3 6 3 Z M 8 0 C 8 0 7 0 7 1 C 7 1 7 2 8 2 C 8 2 9 2 9 1 C 9 0 8 0 8 0 M 9 5 C 9 4 8 4 8 4 S 7 4 7 5 S 8 6 8 6 S 9 6 9 5")
                    .attr("fill", "rgba(0,0,0, .4)")
                    .style("stroke-width", ".5px")
                    .style("stroke", "rgba(100,100,100)");
            
            aggNodeEnter.append("rect")
                    .attr('class', 'bar')
                    .attr('height', (d) => {return this._barScale(d.data.aggregateMetrics[secondaryMetric]);})
                    .attr('width', 20)
                    .attr("fill", "rgba(0,0,0)")
                    .style("stroke-width", ".5px")
                    .style("stroke", "rgba(100,100,100)");

                    

            // commenting out text for now
            nodeEnter.append("text")
                    .attr("x", (d) => {
                        return d.children || this.model.state['collapsedNodes'].includes(d) ? -13 : 13;
                    })
                    .attr("dy", ".75em")
                    .attr("text-anchor", (d) => {
                        return d.children || this.model.state['collapsedNodes'].includes(d) ? "end" : "start";
                    })
                    .text((d) => {
                        if(!d.children){
                            return d.data.name;
                        }
                        else if(d.children.length == 1){
                            return "";
                        }
                        return "";
                    })
                    .style("font", "12px monospace")
                    .style('fill','rgba(0,0,0,.9)');

            dNodeEnter.append("text")
                .attr("x", function () {
                    return 30;
                })
                .attr("dy", "1em")
                .attr("text-anchor", function () {
                    return "start";
                })
                .text((d) =>  {
                    if (d.elided.length > 1){
                        return `Children of: ${d.parent.data.name}` ;
                    } 
                    else{
                        return `${d.data.name} Subtree`;
                    }
                })
                .style("font", "12px monospace")
                .style('fill','rgba(0,0,0,.9)');

            aggNodeEnter.append("text")
                .attr("x", function () {
                    return 25;
                })
                .attr("dy", "1em")
                .attr("text-anchor", function () {
                    return "start";
                })
                .text((d) =>  {
                    if (d.elided.length > 1){
                        return `Children of: ${d.parent.data.name}` ;
                    } 
                    else{
                        return `${d.data.name} Subtree`;
                    }
                })
                .style("font", "12px monospace")
                .style('fill','rgba(0,0,0,.9)');


            // links
            var link = treeGroup.selectAll("path.link")
            .data(this.links[treeIndex], (d) =>  {
                return d.data.metrics._hatchet_nid || d.data.metrics.id;
            });

            // Enter any new links at the parent's previous position.
            var linkEnter = link.enter().insert("path", "g")
                    .attr("class", "link")
                    .attr("d", (d) =>  {
                        return this.diagonal(d.parent, d.parent, treeIndex);
                    })
                    .attr('fill', 'none')
                    .attr('stroke', '#ccc')
                    .attr('stroke-width', '2px');


            // ---------------------------------------------
            // Updates 
            // ---------------------------------------------
            var nodeUpdate = nodeEnter.merge(node);
            var dNodeUpdate = dNodeEnter.merge(dummyNodes);
            var linkUpdate = linkEnter.merge(link);
            var aggNodeUpdate = aggNodeEnter.merge(aggBars);
            

            /**
             * 
             * 
             * NOTE TO CONNOR: THIS IS NOT WORKING. FIND OUT WHY!?
             * 
             * 
             */
            // Chart updates
            chart
                .transition()
                .duration(globals.duration)
                .attr("transform", () => {
                    if(this.model.state["activeTree"].includes(this.model.data["rootNodeNames"][treeIndex+1])){
                        return `translate(${this._margin.left}, ${this._margin.top})`;
                    } 
                    else {
                        return `translate(${this._margin.left}, ${this.chartOffset})`;
                    }
                })    
                .style("display", () => {
                    if(this.model.state["activeTree"].includes("Show all trees")){
                        return "inline-block";
                    } 
                    else if(this.model.state["activeTree"].includes(this.model.data["rootNodeNames"][treeIndex+1])){
                        return "inline-block";
                    } 
                    else {
                        return "none";
                    }
                });

            //legend updates
            chart.selectAll(".legend rect")
                .transition()
                .duration(globals.duration)
                .attr('fill', (d) => {
                    return this._colorManager.getColorLegend(treeIndex)[d];
                })
                .attr('stroke', 'black');

            chart.selectAll('.legend text')
                .transition()
                .duration(globals.duration)
                .text((d, i) => {
                    if (this.metricColumns.includes(this.model.state["primaryMetric"])) {
                        return this._colorManager.getLegendDomains(treeIndex)[6 - d - 1].toFixed(2) + ' - ' + this._colorManager.getLegendDomains(treeIndex)[6 - d].toFixed(2);
                    } else if (this.attributeColumns.includes(this.model.state["primaryMetric"])) {
                        return this._colorManager.getLegendDomains(treeIndex)[i];
                    }
                });


            // Transition links to their new position.
            linkUpdate.transition()
                    .duration(globals.duration)
                    .attr("d", (d) => {
                        return this.diagonal(d, d.parent, treeIndex);
                    });


            // Transition normal nodes to their new position.
            nodeUpdate
                .transition()
                .duration(globals.duration)
                .attr("transform", (d) => {
                    return `translate(${this._treeDepthScale(d.depth)}, ${this._getLocalNodeX(d.x, treeIndex)})`;
                });
                    
            //update other characteristics of nodes
            nodeUpdate
                .select('circle.circleNode')
                .style('stroke', (d) => {
                    if (this.model.state['collapsedNodes'].includes(d)){
                        return "#89c3e0";
                    }
                    else{
                        return 'black';
                    }
                })
                .style("stroke-dasharray", (d) => {
                    return this.model.state['collapsedNodes'].includes(d) ? '4' : '0';
                }) //lightblue
                .style('stroke-width', (d) => {
                    if (this.model.state['collapsedNodes'].includes(d)){
                        return '6px';
                    } 
                    else if (this.model.state['selectedNodes'].includes(d)){
                        return '4px';
                    } 
                    else {
                        return '1px';
                    }
                })
                .attr('cursor', 'pointer')
                .transition()
                .duration(globals.duration)
                .attr("r", (d) => {
                    if (this.model.state['selectedNodes'].includes(d)){
                        return this._nodeScale(d.data.metrics[secondaryMetric]) + 2;
                    }
                    return this._nodeScale(d.data.metrics[secondaryMetric]);
                })
                .style('fill', (d) => {
                    if(this.model.state["legend"] == globals.UNIFIED){
                        return this._colorManager.calcColorScale(d.data, -1);
                    }
                    return this._colorManager.calcColorScale(d.data, treeIndex);

                });
            
            nodeUpdate.select("text")
                .attr("x", (d) => {
                    return d.children || this.model.state['collapsedNodes'].includes(d) ? -13 : this._nodeScale(d.data.metrics[secondaryMetric]) + 5;
                })
                .attr("dy", ".5em")
                .attr("text-anchor", (d) => {
                    return d.children || this.model.state['collapsedNodes'].includes(d) ? "end" : "start";
                })
                .text((d) => {
                    if(!d.children || d.children.length == 0){
                        return d.data.name;
                    }
                    return "";
                });
            
            dNodeUpdate
                .selectAll(".dummyNode")
                .attr("d", "M 6 2 C 6 2 5 2 5 3 S 6 4 6 4 S 7 4 7 3 S 6 2 6 2 Z M 6 3 S 6 3 6 3 Z M 8 0 C 8 0 7 0 7 1 C 7 1 7 2 8 2 C 8 2 9 2 9 1 C 9 0 8 0 8 0 M 9 5 C 9 4 8 4 8 4 S 7 4 7 5 S 8 6 8 6 S 9 6 9 5")
                .attr("fill", "rgba(180,180,180)")
                .style("stroke-width", ".5px")
                .style("stroke", "rgba(100,100,100)")
                .attr("transform", function () {
                    let scale = 3;
                    return `scale(${scale})`;
                });
            
            dNodeUpdate
                .transition()
                .duration(globals.duration)
                .attr("transform", function (d)  {
                        let h = d3.select(this).select('path').node().getBBox().height;
                        return `translate(${self._treeDepthScale(d.depth)-15}, ${self._getLocalNodeX(d.x, treeIndex) - (h+1)/2})`;
                });

            aggNodeUpdate
                .select('rect')
                .attr('height', (d) => {return  this._barScale(d.data.aggregateMetrics[secondaryMetric]);})
                .style('stroke-width', (d) => {
                    if (this.model.state['selectedNodes'].includes(d)){
                        return '3px';
                    } 
                    else {
                        return '1px';
                    }
                })
                .style('fill', (d) =>  {
                    if(this.model.state["legend"] == globals.UNIFIED){
                        return this._colorManager.calcColorScale(d.data, -1);
                    }
                    return this._colorManager.calcColorScale(d.data, treeIndex);
                });

            aggNodeUpdate
                .transition()
                .duration(globals.duration)
                .attr("transform", function (d) {
                        let h = d3.select(this).select('rect').node().getBBox().height;
                        let w = d3.select(this).select('rect').node().getBBox().width;
                        return `translate(${self._treeDepthScale(d.depth)-w/3}, ${self._getLocalNodeX(d.x, treeIndex) - h/2})`;
                });
            
                    
            // ---------------------------------------------
            // Exit
            // ---------------------------------------------
            // Transition exiting nodes to the parent's new position.
            var nodeExit = node.exit().transition()
                .duration(globals.duration)
                .attr("transform", (d) =>  {
                    return "translate(" + this._treeDepthScale(d.parent.depth) + "," + this._getLocalNodeX(d.parent.x, treeIndex) + ")";
                })
                .remove();

            nodeExit.select("circle")
                .attr("r", 1e-6);

            nodeExit.select("text")
                .style("fill-opacity", 1)
                .remove();
            
            dummyNodes.exit()
                .remove();
            
            aggBars.exit()
                .remove();

            // Transition exiting links to the parent's new position.
        link.exit().transition()
                .duration(globals.duration)
                .attr("d", (d) =>  {
                    return this.diagonal(d.parent, d.parent, treeIndex);
                })
                .remove();
            
            // make canvas always fit tree height
            this.chartOffset = this._treeLayoutHeights[treeIndex] + this.treeOffset + this._margin.top;
            this._height += this.chartOffset;
        }                    

        this.svg.attr("height", this._height);
    }
}

export default ChartView;