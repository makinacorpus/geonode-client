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
    saveFeatureText: "UT:Save",
    
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
	
	this.featuresPanel = new Ext.Panel({
            title: this.featuresPanelText,
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
            bbar: ["->", 
            {
                text: this.saveFeatureText,
                iconCls: "gxp-icon-save",
                handler: function() {
                    jsonDataEncode = Ext.util.JSON.encode(this.featureCache);
                    Ext.Ajax.request({
                        url: this.urlWriteFeature,
                        method: 'POST',
                        params: { data :jsonDataEncode, source: this.user},
                        success: function(response, options) {
                            Ext.Msg.alert('Information', 'Save successful.');
                        },
                        failure: function(response, options) {
                            Ext.Msg.alert('Error', 'Save failed.');
                        }
                    });
                },
                scope: this
            }]
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
            menu: new gxp.menu.LayerMenu({
                layers: this.mapPanel.layers
            })
        });

        tools.unshift("-");
        tools.unshift(layerChooser);

        var aboutButton = new Ext.Button({
            tooltip: "About this map",
            iconCls: "icon-about",
            handler: this.displayAppInfo,
            scope: this
        });

        tools.push("->");
        tools.push(aboutButton);

        return tools;
    }
});
