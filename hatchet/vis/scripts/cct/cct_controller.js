import { globals } from "./cct_globals";

class Controller{
    /**
     * Handles interaction and events by taking requests from the view
     * and firing off functions in the model.
     */
    constructor(model){
        this.model = model;
    }

    dispatcher(){
        return (evt) => {
            // All types of events run through a central dispatch
            // function. The dispatch function decides what to do.
            switch(evt.type) {
                case (globals.signals.CLICK):
                    this.model.updateSelected([evt.node]);
                    break;
                case (globals.signals.DBLCLICK):
                    this.model.handleDoubleClick(evt.node);
                    break;
                case(globals.signals.TOGGLEBRUSH):
                    this.model.toggleBrush();
                    break;
                case (globals.signals.BRUSH):
                    this.model.setBrushedPoints(evt.selection);
                    break;
                case (globals.signals.METRICCHANGE):
                    this.model.changeMetric(evt.newMetric, evt.source);
                    break;
                case(globals.signals.COLORCLICK):
                    this.model.changeColorScheme();
                    break;
                case(globals.signals.TREECHANGE):
                    this.model.updateActiveTrees(evt.display);
                    break;
                case(globals.signals.LEGENDCLICK):
                    this.model.updateLegends();
                    break;
                case(globals.signals.ENABLEMASSPRUNE):
                    this.model.enablePruneTree(evt.checked, evt.threshold);
                    break;
                case(globals.signals.REQUESTMASSPRUNE):
                    this.model.pruneTree(evt.threshold);
                    break;
                case(globals.signals.RESETVIEW):
                    this.model.resetView();
                    break;
                default:
                    console.warn('Unknown event type', evt.type);
            }
        }
    }
}

export default Controller;