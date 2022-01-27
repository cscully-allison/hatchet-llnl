import { makeSignaller, RT, d3, globals} from "./cct_globals";
import { hierarchy as d3v7_hierarchy } from 'd3-hierarchy';
import { bin } from 'd3-array';
import Forest  from './cct_repr';


class Model{
    constructor(){
        this._observers = makeSignaller();

        //initialize default data and state
        this.data = {
                        "trees":[],
                        "legends": ["Unified", "Individual"],
                        "colors": ["Default", "Inverted"],
                        "forestData": null,
                        "rootNodeNames": ["Show all trees"],
                        "currentStrictness": 1.5,
                        "distCounts":[],
                        "maxHeight": 0
                    };

        this.state = {
                        "selectedNodes":[], 
                        "collapsedNodes":[],
                        "primaryMetric": null,
                        "secondaryMetric": null,
                        "lastClicked": null,
                        "legend": 0,
                        "colorScheme": 0,
                        "legendText": this.data.legends[0],
                        "colorText": this.data.colors[0],
                        "brushOn": -1,
                        "hierarchyUpdated": true,
                        "cachedThreshold": 0,
                        "outlierThreshold": 0,
                        "pruneEnabled": false
                    };

        //setup model
        let cleanTree = RT["hatchet_tree_def"];
        let _forestData = JSON.parse(cleanTree);
        this.forest = new Forest(_forestData);

        // // pick the first metric listed to color the nodes
        this.state.primaryMetric = this.forest.metricColumns[0];
        this.state.secondaryMetric = this.forest.metricColumns[1];
        this.state.activeTree = "Show all trees";
        this.state.treeXOffsets = [];
        this.state.lastClicked = this.forest.getCurrentTree(0);

        this.forest.aggregateTreeData(this.state.primaryMetric, 0.0, "FlagZeros")

    }

    // --------------------------------------------
    // Node selection helper functions
    // --------------------------------------------

    _printNodeData(nodeList) {
        /**
             * To pretty print the node data as a IPython table
             * 
             * @param {Array} nodeList - An array of selected nodes for formatting
             */
        
        var nodeStr = '<table><tr><td>name</td>';
        var numNodes = nodeList.length;
        var metricColumns = this.forest["metricColumns"];

        //lay the nodes out in a table
        for (let i = 0; i < metricColumns.length; i++) {
            nodeStr += '<td>' + metricColumns[i] + '</td>';
        }
        nodeStr += '</tr>';
        for (let i = 0; i < numNodes; i++) {
            nodeStr += "<tr>"
            for (var j = 0; j < metricColumns.length; j++) {
                if (j == 0) {
                    if (nodeList[i].data.aggregateMetrics && nodeList[i].elided.length == 1){
                        nodeStr += `<td>${nodeList[i].data.frame.name} Subtree </td>`
                    }
                    else if(nodeList[i].data.aggregateMetrics && nodeList[i].elided.length > 1){
                        nodeStr += `<td>Children of: ${nodeList[i].parent.data.frame.name} </td>`
                    }
                    else{
                        nodeStr += `<td>${nodeList[i].data.frame.name}</td>`;
                    }
                }
                if (nodeList[i].data.aggregateMetrics){
                    nodeStr += `<td>${nodeList[i].data.aggregateMetrics[metricColumns[j]].toFixed(2)}</td>`
                }
                else{
                    nodeStr += `<td>${nodeList[i].data.metrics[metricColumns[j]].toFixed(2)}</td>`
                }
            }
            nodeStr += '</tr>'
        }
        nodeStr = nodeStr + '</table>';

        return nodeStr;
    }

    _printQuery(nodeList) {
        /**
             * Prints out user selected nodes as a query string which can be used in the GraphFrame.filter() function.
             * 
             * @param {Array} nodeList - An array of selected nodes for formatting
             */
        var leftMostNode = {depth: Number.MAX_VALUE, data: {name: 'default'}};
        var rightMostNode = {depth: 0, data: {name: 'default'}};
        var selectionIsAChain = false;

        for (var i = 0; i < nodeList.length; i++) {
            if (nodeList[i].depth < leftMostNode.depth) {
                leftMostNode = nodeList[i];
            }
            if (nodeList[i].depth > rightMostNode.depth) {
                rightMostNode = nodeList[i];
            }
            if ((i > 1) && (nodeList[i].x == nodeList[i-1].x)) {
                selectionIsAChain = true;
            }
            else {
                selectionIsAChain = false;
            }
        }

        //do some evaluation for other subtrees
        // we could generate python code that does this
        var queryStr = ['<no query generated>'];
        if ((nodeList.length > 1) && (selectionIsAChain)) {
            // This query is for chains
            queryStr = [{name: leftMostNode.data.frame.name }, '*', {name: rightMostNode.data.frame.name }];
        }
        else if (nodeList.length > 1) {
            // This query is for subtrees
            queryStr = [{name: leftMostNode.data.frame.name }, '*', {depth: '<=' + rightMostNode.depth}];
        }
        else {
            //Single node query
            queryStr = [{name: leftMostNode.data.frame.name}];
        }

        return queryStr;
    }

    register(s){
        /**
         * Registers a signaller (a callback function) to be run with _observers.notify()
         * 
         * @param {Function} s - (a callback function) to be run with _observers.notify()
         */
        this._observers.add(s);
    }


    fetchBins(numBins){
        let nodes = []
        if(this.data.distCounts.length != numBins){
            for(let t of this.forest.getTrees()){
                nodes = nodes.concat(t.descendants()); 
            }
        }

        let bins = bin().value(d=>d.data.metrics[this.state.primaryMetric]).thresholds(numBins);
        this.data.distCounts = bins(nodes);

        return this.data.distCounts;
    }

    enablePruneTree(threshold){
        /**
         * Enables/disables the mass prune tree functionality.
         * Prunes tree on click based on current slider position.
         * 1.5 by default from view.
         * 
         * @param {bool} enabled - Switch bool that guides if we disable or enable mass pruning
         * @param {float} threshold - User defined strictness of pruning. Used as the multiplier in set outlier flags.
         *      On first click this will be 1.5.
         */

        this.state.pruneEnabled = !this.state.pruneEnabled;
        if (this.state.pruneEnabled){
            this.data.currentStrictness = threshold;
            this.forest.aggregateTreeData(this.state.primaryMetric, threshold, "FlagOutliers");
            this.state.hierarchyUpdated = true;
        } 
        
        this._observers.notify();
        
    }

    pruneTree(threshold){
        /**
         * Interface to the private tree aggregation functions.
         *  Calls when user adjusts automatic pruning slider.
         * 
         * @param {float} threshold - User defined strictness of pruning. Used as the multiplier in set outlier flags.
         */
        this.data.currentStrictness = threshold;
        this.forest.aggregateTreeData(this.state.primaryMetric, threshold, "FlagOutliers");
        this.state.hierarchyUpdated = true;

        this._observers.notify();
    }

    updateSelected(nodes){
        /**
         * Updates which nodes are "Selected" by the user in the model
         *
         * @param {Array} nodes - A list of selected nodes
         */
        this.state['selectedNodes'] = nodes;
        this.updateTooltip(nodes);

        if(nodes.length > 0 && nodes[0]){
            RT['jsNodeSelected'] = JSON.stringify(this._printQuery(nodes));
        } else {
            RT['jsNodeSelected'] = JSON.stringify(["*"]);
        }
        
        this._observers.notify();
    }

    handleDoubleClick(d){
        /**
         * Manages the collapsing and expanding of subtrees
         *  when a user is manually pruning or exploring a tree.
         * 
         * @param {node} d - The node the user just double clicked.
         *      Can be a surrogate or real node.
         */
        //hiding a subtree
        if(!d.dummy){
            if(d.parent){
                //main manipulation is in parent scope
                let children = d.parent.children;

                if(!d.parent._children){
                    d.parent._children = [];
                }

                d.parent._children.push(d);
                let dummy = this.forest._buildDummyHolder(d, d.parent, [d]);
                let swapIndex = d.parent.children.indexOf(d);
                children[swapIndex] = dummy;
            }
        } 

        // Expanding a dummy node 
        // Replaces a node if one was elided
        // Appends if multiple were elided
        else{
            
            if(d.elided.length == 1){
                // patch that clears aggregate metrics upon doubleclick
                delete d.elided[0].data.aggregateMetrics;

                let insIndex = d.parent.children.indexOf(d);
                d.parent.children[insIndex] = d.elided[0];
            }
            else{
                for(let elided of d.elided){
                    delete elided.data.aggregateMetrics;
                    let delIndex = d.parent._children.indexOf(elided);
                    d.parent._children.splice(delIndex, 1);

                    d.parent.children.push(elided);
                }
                d.parent.children = d.parent.children.filter(child => child !== d);
            }
        }

        this.state["lastClicked"] = d;

        this.state.hierarchyUpdated = true;
        this._observers.notify();
    }

    toggleBrush(){
        /**
         * Toggles the brushing functionality with a button click
         *
         */

        this.state["brushOn"] = -this.state["brushOn"];
        this._observers.notify();
    }

    setBrushedPoints(selection){
        /**
         * Calculates which nodes are in the brushing area.
         * 
         * @param {Array} selection - Selected nodes
         *
         */

        if(selection){
            this.updateSelected(selection);
        }
        else{
            this.updateSelected([]);
        }
        
    }

    updateTooltip(nodes){
        /**
         * Updates the model with new tooltip information based on user selection
         * 
         * @param {Array} nodes - A list of selected nodes
         *
         */
        if(nodes.length > 0 && nodes[0]){
            var longestName = 0;
            nodes.forEach(function (d) {
                var nodeData = d.data.frame.name + ': ' + d.data.metrics.time + 's (' + d.data.metrics["time (inc)"] + 's inc)';
                if (nodeData.length > longestName) {
                    longestName = nodeData.length;
                }
            });
            this.data["tipText"] = this._printNodeData(nodes);
        } 
        else{
            this.data["tipText"] = '<p>Click a node or "Select nodes" to see more info</p>';
        }
    }

    changeMetric(newMetric, source){
            /**
         * Changes the currently selected metric in the model.
         * 
         * @param {String} newMetric - the most recently selected metric
         *
         */

        if(source.includes("primary")){
            this.state.primaryMetric = newMetric;
        } 
        else if(source.includes("secondary")){
            this.state.secondaryMetric = newMetric;
        }
        
        if(this.state.pruneEnabled){
            this.forest._aggregateTreeData(this.state.primaryMetric, this.state.currentStrictness);
            this.state.hierarchyUpdated = true;
        }
        this._observers.notify();
    }
    
    changeColorScheme(v){
        /**
         * Changes the current color scheme to inverse or regular. Updates the view
         *
         */

        //loop through the possible color schemes
        this.state["colorScheme"] = this.data["colors"].indexOf(v);
        this.state["colorText"] = v;
        this._observers.notify();
    }

    updateLegends(v){
        /**
         * Toggles between divergent or unified legends. Updates the view
         *
         */
        //loop through legend configruations
        this.state["legend"] = this.data["legends"].indexOf(v);
        this.state["legendText"] = v;
        this._observers.notify();
    }

    updateActiveTrees(activeTree){
        /**
         * Sets which tree is currently "active" in the model. Updates the view.
         *
         */
        this.state["activeTree"] = activeTree;
        this._observers.notify();
    }

    resetView(){
        /**
         * Function that sets a flag which causes the 
         * view to reset all trees to their original layouts.
         */
        this.state.resetView = true;
        this._observers.notify();
    }

}


export default Model;