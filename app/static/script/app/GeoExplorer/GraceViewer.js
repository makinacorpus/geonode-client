  /**
 * Copyright (c) 2009-2010 The Open Planning Project
 *
 * @requires GeoExplorer.js
 */

/** api: (define)
 *  module = GeoExplorer
 *  class = Embed
 *  base_link = GeoExplorer
 */
Ext.namespace("GeoExplorer");

/** api: constructor
 *  ..class:: GeoExplorer.Viewer(config)
 *
 *  Create a GeoExplorer application suitable for embedding in larger pages.
 */
GeoExplorer.GraceViewer = Ext.extend(GeoExplorer, {
    /**
     * Property: featuresPanel
     * {GeoExt.FeaturesPanel} the feature panel for the main viewport's map
     */
    featuresPanel: null,
    /**
     * Property: featuresTabPanel
     * {GeoExt.FeaturesPanel} the feature tab panel for the main viewport's map
     */    
    featuresTabPanel: null,

    /** private: property[featureCache]
     *  ``Object``
     */
    featureCache: null,
    
    /** private: property[user]
     *  ``Object``
     */
    user: null,

    /** api: config[useCapabilities]
     *  ``Boolean`` If set to false, no Capabilities document will be loaded.
     */
    
    featuresPanelText: "UT:Features",
    saveFeatureText: "Enregistrer",
    saveSuccessfulText: "Enregistrement effectué",
    saveFailedText: "Enregistrement échoué",
    confirmSaveText: "Confirmer la modification",
    delFeatureText: "Supprimer",
    delSuccessfulText: "Suppression effectuée",
    delFailedText: "Suppression échouée",
    confirmDelText: "Confirmer la suppression",

    
    /** api: config[useToolbar]
     *  ``Boolean`` If set to false, no top toolbar will be rendered.
     */

    loadConfig: function(config) {
        var source;
        for (var s in config.sources) {
            source = config.sources[s];
            if (!source.ptype || /wmsc?source/.test(source.ptype)) {
                source.forceLazy = config.useCapabilities === false;
            }
            if (config.useToolbar === false) {
                var remove = true, layer;
                for (var i=config.map.layers.length-1; i>=0; --i) {
                    layer = config.map.layers[i];
                    if (layer.source == s) {
                        if (layer.visibility === false) {
                            config.map.layers.remove(layer);
                        } else {
                            remove = false;
                        }
                    }
                }
                if (remove) {
                    delete config.sources[s];
                }
            }
        }
        if (config.useToolbar !== false) {
            config.tools = (config.tools || []).concat({
                ptype: "gxp_styler",
                id: "styler",
                rasterStyling: true,
                actionTarget: undefined
            });
            
            
            config.tools = (config.tools || []).concat({
                ptype: "gxp_zoom",
                actionTarget: {target: "main.tbar", index: 4}
            });

            config.tools = (config.tools || []).concat({
                ptype: "gxp_zoombox",
                actionTarget: {target: "main.tbar", index: 4}
            });

            if (!config.tools_enabled || config.tools_enabled.indexOf("legend") != -1) {
                config.tools = (config.tools || []).concat({
                    ptype: "gxp_legend",
                    actionTarget: {target: "main.tbar", index: 15}
                });
            }

        }

        // load the super's super, because we don't want the default tools from
        // GeoExplorer
        GeoExplorer.superclass.loadConfig.apply(this, arguments);
    },
    
    /** private: method[initPortal]
     * Create the various parts that compose the layout.
     */
    initPortal: function() {

        // TODO: make a proper component out of this
        if (this.useMapOverlay !== false) {
            this.mapPanel.add(this.createMapOverlay());
        }

        if(this.useToolbar !== false) {
            this.toolbar = new Ext.Toolbar({
                xtype: "toolbar",
                region: "north",
                autoHeight: true,
                disabled: true,
                items: this.createTools()
            });
            this.on("ready", function() {this.toolbar.enable();}, this);
        }

	this.featuresTabPanel = new Ext.TabPanel({
                            border: false,
                            deferredRender: false,
                            resizeTabs:true, // turn on tab resizing
                            maxTabWidth: 100,
                            tabWidth:100,
                            //height:400,
                            enableTabScroll:true,
                            activeTab:0,
                            defaults: {autoScroll:true},
                            layoutOnTabChange: true
                        });
	
    // Add button save or not, according to the rights
    featureToolbar = ["->"];
    if (!this.initialConfig.tools_enabled || this.initialConfig.tools_enabled.indexOf("edit_attr") != -1) {
        var saveFeatureButton = new Ext.Button({
                    text: this.saveFeatureText,
                    iconCls: "gxp-icon-save",
                    handler: function() {
                        
                        jsonDataEncode = Ext.util.JSON.encode(this.featureCache);
                        
                        Ext.Msg.show({
                            title: this.confirmSaveText,
                            msg: this.confirmSaveText,
                            buttons: Ext.Msg.YESNO,
                            fn: function(button) {
                                if (button === "yes") {
                                    Ext.Ajax.request({
                                        url: this.urlWriteFeature,
                                        method: 'POST',
                                        params: { data :jsonDataEncode, source: this.user, map_projection: this.mapPanel.map.projection.replace("EPSG:","")},
                                        success: function(response, options) {
                                            var modifiedOk = true;
                                            if(response.responseText) {
                                                status = eval('(' + response.responseText + ')');
                                                if(status.records[0].status == false) {
                                                    Ext.Msg.alert('Information', status.records[0].msg);
                                                    modifiedOk = false;
                                                }
                                            }
                                            if(modifiedOk)
                                                Ext.Msg.alert('Information', this.saveSuccessfulText);
                                        },
                                        failure: function(response, options) {
                                            Ext.Msg.alert('Information', this.saveFailedText);
                                        },
                                        scope: this
                                    });                                
                                }
                            },
                            scope: this,
                            icon: Ext.MessageBox.QUESTION
                        });
                    },
                    scope: this
        });
        featureToolbar.push(saveFeatureButton);
        
    }
    
    // Add button delete or not, according to the rights, and the current map
    if (!this.initialConfig.tools_enabled || this.initialConfig.tools_enabled.indexOf("del_obj") != -1) {
        var delFeatureButton = new Ext.Button({
                    text: this.delFeatureText,
                    iconCls: "gxp-icon-del",
                    handler: function() {
                        
                        jsonDataEncode = Ext.util.JSON.encode(this.featureCache);
                        
                        Ext.Msg.show({
                            title: this.confirmDelText,
                            msg: this.confirmDelText,
                            buttons: Ext.Msg.YESNO,
                            fn: function(button) {
                                if (button === "yes") {
                                    // TODO (remplacer le code ci dessou par le bon).
                                    Ext.Ajax.request({
                                        url: this.urlDeleteFeature,
                                        method: 'POST',
                                        params: { data :jsonDataEncode, source: this.user, map_projection: this.mapPanel.map.projection.replace("EPSG:","")},
                                        success: function(response, options) {
                                            var modifiedOk = true;
                                            if(response.responseText) {
                                                status = eval('(' + response.responseText + ')');
                                                if(status.records[0].status == false) {
                                                    Ext.Msg.alert('Information', status.records[0].msg);
                                                    modifiedOk = false;
                                                }
                                            }
                                            if(modifiedOk) {
                                                Ext.Msg.alert('Information', this.delSuccessfulText);
                                                // Refresh map
                                                for(i = 0; i < this.mapPanel.map.layers.length ; i++) {
                                                    currentLayer = this.mapPanel.map.layers[i];
                                                    if(!currentLayer.isBaseLayer && currentLayer.visibility)
                                                        currentLayer.redraw(true);
                                                }
                                                // Delete selection on map, empty tabs
                                                for (key in this.tools) {
                                                    var currentTool = this.tools[key];                                                
                                                    if(currentTool.ptype == "gxp_wmsgetandsetfeatureinfo") {
                                                        currentTool.highLightLayer.removeAllFeatures();
                                                        app.featuresTabPanel.removeAll();
                                                        delete app.featureCache;
                                                        break;
                                                    }
                                                }
                                                
                                            }
                                        },
                                        failure: function(response, options) {
                                            Ext.Msg.alert('Information', this.delFailedText);
                                        },
                                        scope: this
                                    });                                
                                }
                            },
                            scope: this,
                            icon: Ext.MessageBox.QUESTION
                        });
                    },
                    scope: this
        });
        featureToolbar.push(delFeatureButton);
    }
    
    
	this.featuresPanel = new Ext.Panel({
            title: this.featuresPanelText,
            bodyCfg : { cls:'x-panel-body feature-panel'},
            border: false,
            hideMode: "offsets",
            split: true,
            autoScroll: true,
            ascending: false,
            map: this.mapPanel.map,
            layout: "fit",
            collapseMode: "mini",
            collapsed: true,
            header: false,
            split: true,
            region: "east",
            width: 400,
            items: [
                this.featuresTabPanel
            ],
            bbar: featureToolbar //["->", saveFeatureButton, delFeatureButton]
        });

        this.mapPanelContainer = new Ext.Panel({
            layout: "card",
            region: "center",
            ref: "../main",
            tbar: this.toolbar,
            defaults: {
                border: false
            },
            items: [
                this.mapPanel
            ],
            ref: "../main",
            activeItem: 0
        });
        if (window.google && google.earth) {
            this.mapPanelContainer.add(
                new gxp.GoogleEarthPanel({
                    mapPanel: this.mapPanel,
                    listeners: {
                        beforeadd: function(record) {
                            return record.get("group") !== "background";
                        }
                    }
                })
            );
        }

        this.portalItems = [
            this.mapPanelContainer,
	    this.featuresPanel
        ];
        
        GeoExplorer.superclass.initPortal.apply(this, arguments);        

    },
    
    /**
     * private: method[addLayerSource]
     */
    addLayerSource: function(options) {
        // use super's super instead of super - we don't want to issue
        // DescribeLayer requests because we neither need to style layers
        // nor to show a capabilities grid.
        var source = GeoExplorer.superclass.addLayerSource.apply(this, arguments);
    },

    /**
     * api: method[createTools]
     * Create the various parts that compose the layout.
     */
    createTools: function() {
        var tools = GeoExplorer.Viewer.superclass.createTools.apply(this, arguments);

        var layerChooser = new Ext.Button({
            tooltip: 'Layer Switcher',
            iconCls: 'icon-layer-switcher',
            menu: new gxp.menu.LayerMenuSortable({
                layers: this.mapPanel.layers,
                map: this.mapPanel.map // new parameter
            })
        });

        if (!this.initialConfig.tools_enabled || this.initialConfig.tools_enabled.indexOf("layers") != -1) {
            tools.unshift("-");
            tools.unshift(layerChooser);
        }

        return tools;
    }
});
