/**
 * Copyright (c) 2009 The Open Planning Project
 */

// http://www.sencha.com/forum/showthread.php?141254-Ext.Slider-not-working-properly-in-IE9
// TODO re-evaluate once we move to Ext 4
Ext.override(Ext.dd.DragTracker, {
    onMouseMove: function (e, target) {
        if (this.active && Ext.isIE && !Ext.isIE9 && !e.browserEvent.button) {
            e.preventDefault();
            this.onMouseUp(e);
            return;
        }
        e.preventDefault();
        var xy = e.getXY(), s = this.startXY;
        this.lastXY = xy;
        if (!this.active) {
            if (Math.abs(s[0] - xy[0]) > this.tolerance || Math.abs(s[1] - xy[1]) > this.tolerance) {
                this.triggerStart(e);
            } else {
                return;
            }
        }
        this.fireEvent('mousemove', this, e);
        this.onDrag(e);
        this.fireEvent('drag', this, e);
    }
});

/**
 * Constructor: GeoExplorer
 * Create a new GeoExplorer application.
 *
 * Parameters:
 * config - {Object} Optional application configuration properties.
 *
 * Valid config properties:
 * map - {Object} Map configuration object.
 * ows - {String} OWS URL
 *
 * Valid map config properties:
 * layers - {Array} A list of layer configuration objects.
 * center - {Array} A two item array with center coordinates.
 * zoom - {Number} An initial zoom level.
 *
 * Valid layer config properties:
 * name - {String} Required WMS layer name.
 * title - {String} Optional title to display for layer.
 */
var GeoExplorer = Ext.extend(gxp.Viewer, {
    
    /**
     * api: config[localGeoServerBaseUrl]
     * ``String`` url of the local GeoServer instance
     */
    localGeoServerBaseUrl: "",
    
    /**
     * api: config[fromLayer]
     * ``Boolean`` true if map view was loaded with layer parameters
     */
    fromLayer: false,

    /**
     * private: property[mapPanel]
     * the :class:`GeoExt.MapPanel` instance for the main viewport
     */
    mapPanel: null,

    /**
     * Property: legendPanel
     * {GeoExt.LegendPanel} the legend for the main viewport's map
     */
    legendPanel: null,
    
    /**
     * Property: toolbar
     * {Ext.Toolbar} the toolbar for the main viewport
     */
    toolbar: null,

    /**
     * Property: capGrid
     * {<Ext.Window>} A window which includes a CapabilitiesGrid panel.
     */
    capGrid: null,
    
    /**
     * Property: modified
     * ``Number``
     */
    modified: 0,

    /**
     * Property: popupCache
     * {Object} An object containing references to visible popups so that 
     *     we can insert responses from multiple requests.
     */
    popupCache: null,
    
    /** private: property[busyMask]
     *  ``Ext.LoadMask``
     */
    busyMask: null,
    
    /** private: property[urlPortRegEx]
     *  ``RegExp``
     */
    urlPortRegEx: /^(http[s]?:\/\/[^:]*)(:80|:443)?\//,
    
    //public variables for string literals needed for localization
    backgroundContainerText: "UT:Background",
    connErrorTitleText: "UT:Connection Error",
    connErrorText: "UT:The server returned an error",
    connErrorDetailsText: "UT:Details...",
    heightLabel: 'UT: Height',
    largeSizeLabel: 'UT:Large',
    layerContainerText: "UT:Map Layers",
    layerSelectionLabel: "UT:View available data from:",
    layersContainerText: "UT:Data",
    layersPanelText: "UT:Layers",
    legendPanelText: "UT:Legend",
    loadingMapMessage: "UT:Loading Map...",
    mapSizeLabel: 'UT: Map Size', 
    metadataFormCancelText : "UT:Cancel",
    metadataFormSaveAsCopyText : "UT:Save as Copy",
    metadataFormSaveText : "UT:Save",
    metaDataHeader: 'UT:About this Map',
    metaDataMapAbstract: 'UT:Abstract',
    metaDataMapTitle: 'UT:Title',
    miniSizeLabel: 'UT: Mini',
    premiumSizeLabel: 'UT: Premium',
    printTipText: "UT:Print Map",
    printWindowTitleText: "UT:Print Preview",
    propertiesText: "UT:Properties",
    publishActionText: 'UT:Publish Map',
    routingActionText: 'UT:Routing',
    mobileActionText: 'Saisie directe',
    saveFailMessage: "UT: Sorry, your map could not be saved.",
    saveFailTitle: "UT: Error While Saving",
    saveMapText: "UT: Save Map",
    saveMapAsText: "UT: Save Map As",
    saveNotAuthorizedMessage: "UT: You Must be logged in to save this map.",
    smallSizeLabel: 'UT: Small',
    sourceLoadFailureMessage: 'UT: Error contacting server.\n Please check the url and try again.',
    switchTo3DActionText: "UT:Switch to Google Earth 3D Viewer",
    unknownMapMessage: 'UT: The map that you are trying to load does not exist.  Creating a new map instead.',
    unknownMapTitle: 'UT: Unknown Map',
    unsupportedLayersTitleText: 'UT:Unsupported Layers',
    unsupportedLayersText: 'UT:The following layers cannot be printed:',
    widthLabel: 'UT: Width',
    zoomSelectorText: 'UT:Zoom level',
    zoomSliderTipText: "UT: Zoom Level",
    zoomToLayerExtentText: "UT:Zoom to Layer Extent",

    constructor: function(config) {
        this.popupCache = {};
        // add any custom application events
        this.addEvents(
            /**
             * api: event[saved]
             * Fires when the map has been saved.
             *  Listener arguments:
             *  * ``String`` the map id
             */
            "saved",
            /**
             * api: event[beforeunload]
             * Fires before the page unloads. Return false to stop the page
             * from unloading.
             */
            "beforeunload"
        );

        // add old ptypes
        Ext.preg("gx_wmssource", gxp.plugins.WMSSource);
        Ext.preg("gx_olsource", gxp.plugins.OLSource);
        Ext.preg("gx_googlesource", gxp.plugins.GoogleSource);
        
        // global request proxy and error handling
        Ext.util.Observable.observeClass(Ext.data.Connection);
        Ext.data.Connection.on({
            "beforerequest": function(conn, options) {
                // use django's /geoserver endpoint when talking to the local
                // GeoServer's RESTconfig API
                var url = options.url.replace(this.urlPortRegEx, "$1/");
                if (this.localGeoServerBaseUrl) {
                    if (url.indexOf(this.localGeoServerBaseUrl) == 0) {
                        // replace local GeoServer url with /geoserver/
                        options.url = url.replace(
                            new RegExp("^" + this.localGeoServerBaseUrl),
                            "/geoserver/"
                        );
                        return;
                    }
                    var localUrl = this.localGeoServerBaseUrl.replace(
                        this.urlPortRegEx, "$1/");
                    if(url.indexOf(localUrl + "rest/") === 0) {
                        options.url = url.replace(new RegExp("^" +
                            localUrl), "/geoserver/");
                        return;
                    };
                }
                // use the proxy for all non-local requests
                if(this.proxy && options.url.indexOf(this.proxy) !== 0 &&
                        options.url.indexOf(window.location.protocol) === 0) {
                    var parts = options.url.replace(/&$/, "").split("?");
                    var params = Ext.apply(parts[1] && Ext.urlDecode(
                        parts[1]) || {}, options.params);
                    url = Ext.urlAppend(parts[0], Ext.urlEncode(params));
                    delete options.params;
                    options.url = this.proxy + encodeURIComponent(url);
                }
            },
            "requestexception": function(conn, response, options) {
                if(options.failure) {
                    // exceptions are handled elsewhere
                } else {
                    this.busyMask && this.busyMask.hide();
                    var url = options.url;
                    if (response.status == 401 && url.indexOf("http" != 0) &&
                                            url.indexOf(this.proxy) === -1) {
                        var submit = function() {
                            form.getForm().submit({
                                waitMsg: "Logging in...",
                                success: function(form, action) {
                                    win.close();
                                    document.cookie = action.response.getResponseHeader("Set-Cookie");
                                    // resend the original request
                                    Ext.Ajax.request(options);
                                },
                                failure: function(form, action) {
                                    var username = form.items.get(0);
                                    var password = form.items.get(1);
                                    username.markInvalid();
                                    password.markInvalid();
                                    username.focus(true);
                                },
                                scope: this
                            });
                        }.createDelegate(this);
                        var win = new Ext.Window({
                            title: "GeoNode Login",
                            modal: true,
                            width: 230,
                            autoHeight: true,
                            layout: "fit",
                            items: [{
                                xtype: "form",
                                autoHeight: true,
                                labelWidth: 55,
                                border: false,
                                bodyStyle: "padding: 10px;",
                                url: "/accounts/ajax_login",
                                waitMsgTarget: true,
                                errorReader: {
                                    // teach ExtJS a bit of RESTfulness
                                    read: function(response) {
                                        return {
                                            success: response.status == 200,
                                            records: []
                                        };
                                    }
                                },
                                defaults: {
                                    anchor: "100%"
                                },
                                items: [{
                                    xtype: "textfield",
                                    name: "username",
                                    fieldLabel: "Username"
                                }, {
                                    xtype: "textfield",
                                    name: "password",
                                    fieldLabel: "Password",
                                    inputType: "password"
                                }, {
                                    xtype: "hidden",
                                    name: "csrfmiddlewaretoken",
                                    value: this.csrfToken
                                }, {
                                    xtype: "button",
                                    text: "Login",
                                    inputType: "submit",
                                    handler: submit
                                }]
                            }],
                            keys: {
                                "key": Ext.EventObject.ENTER,
                                "fn": submit
                            }
                        });
                        win.show();
                        var form = win.items.get(0);
                        form.items.get(0).focus(false, 100);
                    } else if (response.status != 405 && url != "/geoserver/rest/styles") {
                        // 405 from /rest/styles is ok because we use it to
                        // test whether we're authenticated or not
                        this.displayXHRTrouble(response);
                    }
                }
            },
            scope: this
        });
        
        // register the color manager with every color field, for Styler
        Ext.util.Observable.observeClass(gxp.form.ColorField);
        gxp.form.ColorField.on({
            render: function(field) {
                var manager = new Styler.ColorManager();
                manager.register(field);
            }
        });

        // global beforeunload handler
        window.onbeforeunload = (function() {
            if (this.fireEvent("beforeunload") === false) {
                return "If you leave this page, unsaved changes will be lost.";
            }
        }).createDelegate(this);
        
        // limit combo boxes to the window they belong to - fixes issues with
        // list shadow covering list items
        Ext.form.ComboBox.prototype.getListParent = function() {
            return this.el.up(".x-window") || document.body;
        };
        
        // don't draw window shadows - allows us to use autoHeight: true
        // without using syncShadow on the window
        Ext.Window.prototype.shadow = false;
        
        if (!config.map) {
            config.map = {};
        }
        config.map.numZoomLevels = config.map.numZoomLevels || 22;

        GeoExplorer.superclass.constructor.apply(this, arguments);

        this.mapID = this.initialConfig.id;
    },
    
    displayXHRTrouble: function(response) {
        response.status && Ext.Msg.show({
            title: this.connErrorTitleText,
            msg: this.connErrorText +
                ": " + response.status + " " + response.statusText,
            icon: Ext.MessageBox.ERROR,
            buttons: {ok: this.connErrorDetailsText, cancel: true},
            fn: function(result) {
                if(result == "ok") {
                    var details = new Ext.Window({
                        title: response.status + " " + response.statusText,
                        width: 400,
                        height: 300,
                        items: {
                            xtype: "container",
                            cls: "error-details",
                            html: response.responseText
                        },
                        autoScroll: true,
                        buttons: [{
                            text: "OK",
                            handler: function() { details.close(); }
                        }]
                    });
                    details.show();
                }
            }
        });
    },
    
    loadConfig: function(config) {
        config.tools = (config.tools || []).concat({
            ptype: "gxp_zoom",
            actionTarget: {target: "paneltbar", index: 4}
        }, {
            ptype: "gxp_navigationhistory",
            actionTarget: {target: "paneltbar", index: 6}
        }, {
            ptype: "gxp_zoomtoextent",
            actionTarget: {target: "paneltbar", index: 8}
        }, {
            ptype: "gxp_layertree",
            outputConfig: {id: "treecontent"},
            outputTarget: "layertree"
        }, {
            ptype: "gxp_zoomtolayerextent",
            actionTarget: "treecontent.contextMenu"
        }, {
            ptype: "gxp_addlayers",
            actionTarget: "treetbar",
            createExpander: function() {
                return new GeoExplorer.CapabilitiesRowExpander({
                    ows: config.localGeoServerBaseUrl + "ows"
                });
            }
        }, {
            ptype: "gxp_removelayer",
            actionTarget: ["treetbar", "treecontent.contextMenu"]
        }, {
            ptype: "gxp_layerproperties",
            layerPanelConfig: {
                "gxp_wmslayerpanel": {rasterStyling: true}
            },
            actionTarget: ["treetbar", "treecontent.contextMenu"]
        }, {
            ptype: "gxp_styler",
            rasterStyling: true,
            actionTarget: ["treetbar", "treecontent.contextMenu"]
        });
        GeoExplorer.superclass.loadConfig.apply(this, arguments);
    },
    
    initMapPanel: function() {
        this.mapItems = [{
            xtype: "gx_zoomslider",
            vertical: true,
            height: 100,
            plugins: new GeoExt.ZoomSliderTip({
                template: "<div>"+this.zoomSliderTipText+": {zoom}<div>"
            })
        }];
        
        GeoExplorer.superclass.initMapPanel.apply(this, arguments);
        
        var layerCount = 0;
        
        this.mapPanel.map.events.register("preaddlayer", this, function(e) {
            var layer = e.layer;
            if (layer instanceof OpenLayers.Layer.WMS) {
                layer.events.on({
                    "loadstart": function() {
                        layerCount++;
                        if (!this.busyMask) {
                            this.busyMask = new Ext.LoadMask(
                                this.mapPanel.map.div, {
                                    msg: this.loadingMapMessage
                                }
                            );
                            this.busyMask.show();
                        }
                        layer.events.unregister("loadstart", this, arguments.callee);
                    },
                    "loadend": function() {
                        layerCount--;
                        if(layerCount === 0) {
                            this.busyMask.hide();
                        }
                        layer.events.unregister("loadend", this, arguments.callee);
                    },
                    scope: this
                });
            } 
        });
    },
    
    /**
     * Method: initPortal
     * Create the various parts that compose the layout.
     */
    initPortal: function() {
        this.on("beforeunload", function() {
            if (this.modified) {
                this.showMetadataForm();
                return false;
            }
        }, this);

        // TODO: make a proper component out of this
        var mapOverlay = this.createMapOverlay();
        this.mapPanel.add(mapOverlay);

        this.on("ready", function() {
            this.mapPanel.layers.on({
                "update": function() {this.modified |= 1;},
                "add": function() {this.modified |= 1;},
                "remove": function(store, rec) {
                    this.modified |= 1;
                },
                scope: this
            });
        });

       var layersContainer = new Ext.Panel({
            id: "layertree",
            autoScroll: true,
            border: false,
            title: this.layersContainerText,
            tbar: {
                id: 'treetbar'
            }
        });

        this.legendPanel = new GeoExt.LegendPanel({
            title: this.legendPanelText,
            border: false,
            hideMode: "offsets",
            split: true,
            autoScroll: true,
            ascending: false,
            map: this.mapPanel.map,
            defaults: {cls: 'legend-item'}
        });
	
        var layerTree;
        this.on("ready", function(){
            var startSourceId = null;
            for (var id in this.layerSources) {
                source = this.layerSources[id];
                if (source.store && source instanceof gxp.plugins.WMSSource &&
                                source.url.indexOf("/geoserver/wms" === 0)) {
                    startSourceId = id;
                }
            }
            // find the add layers plugin
            var addLayers = null;
            for (var key in this.tools) {
                var tool = this.tools[key];
                if (tool.ptype === "gxp_addlayers") {
                    addLayers = tool;
                    addLayers.startSourceId = startSourceId;
                }
            }
            if (!this.fromLayer && !this.mapID) {
                if (addLayers !== null) {
                    addLayers.showCapabilitiesGrid();
                }
            }

            // add custom tree contextmenu items
            layerTree = Ext.getCmp("treecontent");
        }, this);

        var layersTabPanel = new Ext.TabPanel({
            border: false,
            deferredRender: false,
            items: [layersContainer, this.legendPanel],
            activeTab: 0
        });

        //needed for Safari
        var westPanel = new Ext.Panel({
            layout: "fit",
            collapseMode: "mini",
            header: false,
            split: true,
            items: [layersTabPanel],
            region: "west",
            width: 250
        });

        this.toolbar = new Ext.Toolbar({
            disabled: true,
            id: 'paneltbar',
            items: this.createTools()
        });

        this.on("ready", function() {
            // enable only those items that were not specifically disabled
            var disabled = this.toolbar.items.filterBy(function(item) {
                return item.initialConfig && item.initialConfig.disabled;
            });
            this.toolbar.enable();
            disabled.each(function(item) {
                item.disable();
            });
        }, this);
        
        var showContextMenu;
        this.googleEarthPanel = new gxp.GoogleEarthPanel({
            mapPanel: this.mapPanel,
            listeners: {
                "beforeadd": function(record) {
                    return record.get("group") !== "background";
                },
                "show": function() {
                    // disable layers toolbar, selection and context menu
                    layerTree.contextMenu.on("beforeshow", OpenLayers.Function.False);
                    this.on(
                        "beforelayerselectionchange", OpenLayers.Function.False
                    );
                    Ext.getCmp("treetbar").disable();
                },
                "hide": function() {
                    var layerTree = Ext.getCmp("treecontent");
                    if (layerTree) {
                        // enable layers toolbar, selection and context menu
                        layerTree.contextMenu.un("beforeshow", OpenLayers.Function.False);
                        this.un(
                            "beforelayerselectionchange", OpenLayers.Function.False
                        );
                        Ext.getCmp("treetbar").enable();
                    }
                },
                scope: this
            }
        });
        
        this.mapPanelContainer = new Ext.Panel({
            layout: "card", 
            region: "center",
            defaults: {
                // applied to each contained panel
                border:false
            },
            items: [
                this.mapPanel,
                this.googleEarthPanel
            ],
            activeItem: 0
        });

        var header = new Ext.Panel({
            region: "north",
            autoHeight: true,
            contentEl: 'header-wrapper'
        });

        Lang.registerLinks();

        this.portalItems = [
            header, {
                region: "center",
                xtype: "container",
                layout: "fit",
                border: false,
                hideBorders: true,
                items: {
                    layout: "border",
                    deferredRender: false,
                    tbar: this.toolbar,
                    items: [
                        this.mapPanelContainer,
                        westPanel
                    ],
                    ref: "../../main"
                }
            }
        ];
        
        GeoExplorer.superclass.initPortal.apply(this, arguments);
    },
    
    /** private: method[createMapOverlay]
     * Builds the :class:`Ext.Panel` containing components to be overlaid on the
     * map, setting up the special configuration for its layout and 
     * map-friendliness.
     */
    createMapOverlay: function() {
        var searchAddressWrapper = new Ext.Panel({
            cls: 'overlay-element overlay-searchaddress',
            border: false 
        });
        var searchAddress = new Ext.form.TextField({
            name: 'searchAddress',
            cls: 'searchitemtext',
            emptyText:'Commune...',
            selectOnFocus: true,
            enableKeyEvents: true
        });
        
        var searchAddressButton = new Ext.Button({
            text : 'Ok',
            listeners: {
                click: function(){
                    // Using geonames to find places
                    var commune = searchAddress.getEl().dom.value;
                    if (commune != "") {
                        var url = "http://ws.geonames.org/search?name="+commune+"&country=fr&maxRows=10&style=full&featureClass=P";                        
                        Ext.Ajax.request({
                            waitMsg: 'Veuillez patienter',
                            url: url,
                            success:function(response,options){
                                var node = response.responseXML.getElementsByTagName("geonames");
                                var lon, lat, name;
                                if (node.length > 0) {
                                    node = node[0].getElementsByTagName("geoname");
                                    if (node.length > 0) {
                                        lon = node[0].getElementsByTagName("lng")[0].firstChild.data;
                                        lat = node[0].getElementsByTagName("lat")[0].firstChild.data;
                                        name = node[0].getElementsByTagName("name")[0].firstChild.data;

                                        geonamesProjection = new OpenLayers.Projection("EPSG:4326");
                                        displayProjection = new OpenLayers.Projection("EPSG:900913");
                                    }
                                    if (lat && lon) {
                                        if (name)
                                            searchAddress.getEl().dom.value = name;
                                        var lonLat = new OpenLayers.LonLat(lon,lat).transform(geonamesProjection,displayProjection);
                                        
                                        if (!this.initialConfig.locate_zoom)
                                            this.mapPanel.map.setCenter(new OpenLayers.LonLat(lonLat.lon,lonLat.lat),this.mapPanel.map.getZoom());
                                        else
                                            this.mapPanel.map.setCenter(new OpenLayers.LonLat(lonLat.lon,lonLat.lat),this.initialConfig.locate_zoom);
                                    }
                                    else {
                                        Ext.Msg.alert("Informations", "Impossible de trouver ce lieu");
                                    }
                                }
                            },
                            scope: this
                        });
                    }
                },
                scope:this
            },
            cls: 'searchitembutton'
        });
        
        searchAddressWrapper.add(searchAddress);
        searchAddressWrapper.add(searchAddressButton);
        searchAddressWrapper.doLayout();
        
        var scaleLinePanel = new Ext.BoxComponent({
            autoEl: {
                tag: "div",
                cls: "olControlScaleLine overlay-element overlay-scaleline"
            }
        });

        scaleLinePanel.on('render', function(){
            var scaleLine = new OpenLayers.Control.ScaleLine({
                div: scaleLinePanel.getEl().dom,
                geodesic: true
            });

            this.mapPanel.map.addControl(scaleLine);
            scaleLine.activate();
        }, this);

        var zoomSelectorWrapper = new Ext.Panel({
            cls: 'overlay-element overlay-scalechooser',
            border: false 
        });

        var mousePositionWrapper = new Ext.Panel({
            cls: 'overlay-element overlay-mouseposition',
            border: false 
        });
        mousePositionWrapper.on('render', function(){
            var mousePosition = new OpenLayers.Control.MousePosition({
                "numDigits": 3,
                displayProjection: new OpenLayers.Projection("EPSG:4326"),
                div: mousePositionWrapper.getEl().dom
            });
            
            this.mapPanel.map.addControl(mousePosition);
        }, this);


        
        this.on("ready", function() {
            var zoomStore = new GeoExt.data.ScaleStore({
                map: this.mapPanel.map
            });
        
            var zoomSelector = new Ext.form.ComboBox({
                emptyText: this.zoomSelectorText,
                tpl: '<tpl for="."><div class="x-combo-list-item">1 : {[parseInt(values.scale)]}</div></tpl>',
                editable: false,
                triggerAction: 'all',
                mode: 'local',
                store: zoomStore,
                width: 110
            });
    
            zoomSelector.on({
                click: function(evt) {
                    evt.stopEvent();
                },
                mousedown: function(evt) {
                    evt.stopEvent();
                },
                select: function(combo, record, index) {
                    this.mapPanel.map.zoomTo(record.data.level);
                },
                scope: this
            });
            
            function setScale() {
                var scale = zoomStore.queryBy(function(record) {
                    return this.mapPanel.map.getZoom() == record.data.level;
                }, this);
    
                if (scale.length > 0) {
                    scale = scale.items[0];
                    zoomSelector.setValue("1 : " + parseInt(scale.data.scale, 10));
                } else {
                    if (!zoomSelector.rendered) {
                        return;
                    }
                    zoomSelector.clearValue();
                }
            }
            setScale.call(this);
            this.mapPanel.map.events.register('zoomend', this, setScale);

            zoomSelectorWrapper.add(zoomSelector);
            zoomSelectorWrapper.doLayout();
            
        }, this);

        var mapOverlay = new Ext.Panel({
            // title: "Overlay",
            cls: 'map-overlay',
            items: [
                scaleLinePanel,
                zoomSelectorWrapper,
                mousePositionWrapper,
                searchAddressWrapper
            ]
        });

        mapOverlay.on("afterlayout", function(){
            scaleLinePanel.getEl().dom.style.position = 'relative';
            scaleLinePanel.getEl().dom.style.display = 'inline';

            //mapOverlay.getEl().on("click", function(x){x.stopEvent();});
            //mapOverlay.getEl().on("mousedown", function(x){x.stopEvent();});
        }, this);

        return mapOverlay;
    },

    createTools: function() {
        var toolGroup = "toolGroup";
        
        var printButton = new Ext.Button({
            tooltip: this.printTipText,
            iconCls: "icon-print",
            handler: function() {
                var unsupportedLayers = [];
                var printWindow = new Ext.Window({
                    title: this.printWindowTitleText,
                    modal: true,
                    border: false,
                    autoHeight: true,
                    resizable: false,
                    items: [{
                        xtype: "gxux_printpreview",
                        mapTitle: this.about["title"],
                        comment: this.about["abstract"],
                        minWidth: 336,
                        printMapPanel: {
                            height: Math.min(450, Ext.get(document.body).getHeight()-150),
                            autoWidth: true,
                            limitScales: true,
                            map: {
                                controls: [
                                    new OpenLayers.Control.Navigation({
                                        zoomWheelEnabled: false,
                                        zoomBoxEnabled: false
                                    }),
                                    new OpenLayers.Control.PanPanel(),
                                    new OpenLayers.Control.Attribution()
                                ],
                                eventListeners: {
                                    "preaddlayer": function(evt) {
                                        if(evt.layer instanceof OpenLayers.Layer.Google) {
                                            unsupportedLayers.push(evt.layer.name);
                                            return false;
                                        }
                                    },
                                    scope: this
                                }
                            }
                        },
                        printProvider: {
                            capabilities: window.printCapabilities,
                            listeners: {
                                "beforeprint": function() {
                                    // The print module does not like array params.
                                    //TODO Remove when http://trac.geoext.org/ticket/216 is fixed.
                                    printWindow.items.get(0).printMapPanel.layers.each(function(l){
                                        var params = l.getLayer().params;
                                        for(var p in params) {
                                            if (params[p] instanceof Array) {
                                                params[p] = params[p].join(",");
                                            }
                                        }
                                    });
                                },
                                "print": function() {printWindow.close();},
                                "printException": function(cmp, response) {
                                    this.displayXHRTrouble(response);
                                },
                                scope: this
                            }
                        },
                        includeLegend: true,
                        sourceMap: this.mapPanel,
                        legend: this.legendPanel
                    }]
                }).show();                
                printWindow.center();
                
                unsupportedLayers.length &&
                    Ext.Msg.alert(this.unsupportedLayersTitleText, this.unsupportedLayersText +
                        "<ul><li>" + unsupportedLayers.join("</li><li>") + "</li></ul>");

            },
            scope: this
        });

        var enable3DButton = new Ext.Button({
            iconCls:"icon-3D",
            tooltip: this.switchTo3DActionText,
            enableToggle: true,
            toggleHandler: function(button, state) {
                if (state === true) {
                    this.mapPanelContainer.getLayout().setActiveItem(1);
                    this.toolbar.disable();
                    button.enable();
                } else {
                    this.mapPanelContainer.getLayout().setActiveItem(0);
                    this.toolbar.enable();
                }
            },
            scope: this
        });

        var tools = [];
        var publishEnable = false;
        if (!this.initialConfig.tools_enabled || this.initialConfig.tools_enabled.indexOf("save") != -1)
            tools.push(new Ext.Button({
                    tooltip: this.saveMapText,
                    handler: this.showMetadataForm,
                    scope: this,
                    iconCls: "icon-save"
                }));
        if (!this.initialConfig.tools_enabled || this.initialConfig.tools_enabled.indexOf("publish") != -1) {
            tools.push(new Ext.Action({
                    tooltip: this.publishActionText,
                    handler: this.makeExportDialog,
                    scope: this,
                    iconCls: 'icon-export',
                    disabled: !this.mapID
                }));
            publishEnable = true;
        }
        if (!this.initialConfig.tools_enabled || this.initialConfig.tools_enabled.indexOf("print") != -1)
            tools.push(window.printCapabilities ? printButton : "");
        tools.push("-");
        if (!this.initialConfig.tools_enabled || this.initialConfig.tools_enabled.indexOf("3D") != -1)
            tools.push(enable3DButton);

        // Edit on mobile
        if (!this.initialConfig.tools_enabled || this.initialConfig.tools_enabled.indexOf("edit_mobile") != -1) {
            tools.push(new Ext.Button({
                    tooltip: this.mobileActionText,
                    handler: function() {
                        window.location = this.initialConfig.urlMobile;
                    },
                    scope: this,
                    enableToggle: false,
                    iconCls: 'icon-mobile'
                }));
            tools.push("-");
        }
            
        
        // Routing
        if (!this.initialConfig.tools_enabled || this.initialConfig.tools_enabled.indexOf("routing") != -1)
            tools.push(new Ext.Button({
                    tooltip: this.routingActionText,
                    handler: this.showRoute,
                    scope: this,
                    enableToggle: true,
                    iconCls: 'icon-routing'
                }));

            
        this.on("saved", function() {
            // enable the "Publish Map" button
            if(publishEnable)
                tools[1].enable();
            this.modified ^= this.modified & 1;
        }, this);

        return tools;
    },

    /** private: method[makeExportDialog]
     *
     * Create a dialog providing the HTML snippet to use for embedding the 
     * (persisted) map, etc. 
     */
    makeExportDialog: function() { 
        new Ext.Window({
            title: this.publishActionText,
            layout: "fit",
            width: 380,
            autoHeight: true,
            items: [{
                xtype: "gxp_embedmapdialog",
                url: this.rest + this.mapID + "/embed" 
            }]
        }).show();
    },

    /** private: method[showRoute]
     *
     * Enable user to select a node on map, and trace route to ref node
     *
     */
    showRoute: function(button) {
        if(button.pressed) {
            // Wait for the user to click on the map (a node)
            this.mapPanel.map.events.register('click', this.mapPanel.map, this.retreive_route);
        }
        else {
            this.mapPanel.map.events.unregister('click', this.mapPanel.map, this.retreive_route);
            route_layers = this.mapPanel.map.getLayersByName("route_layer");
            if(route_layers.length != 0) {
                routeLay = route_layers[0];
                routeLay.removeAllFeatures();
            }
        }
    },

    /** private: method[retreive_route]
     *
     * Get the route to node ref
     *
     */
    retreive_route: function(e) {
        var pixel = new OpenLayers.Pixel(e.xy.x,e.xy.y);
        var lonlat = this.getLonLatFromPixel(pixel);
        // Find the closest node, and display route to node ref
        Ext.Ajax.request({
            url: "/route/?x="+lonlat.lon+"&y="+lonlat.lat+"&map_projection="+this.projection.replace("EPSG:",""),
            method: 'GET',
            success: function(response, options) {
                // Draw the response :

                var styleRoute = new OpenLayers.StyleMap({
                    "default": new OpenLayers.Style({
                        pointRadius: 6, // sized according to type attribute
                        strokeColor: "#00FF00",
                        strokeWidth: 6,
                        graphicZIndex: 1
                    })
                });

                // Clear layer
                data = Ext.util.JSON.decode(response.responseText);
                route_layers = this.getLayersByName("route_layer");
                if(route_layers.length == 0) {
                    routeLay = new OpenLayers.Layer.Vector("route_layer", {styleMap: styleRoute});
                    this.addLayer(routeLay);
                }
                else {
                    routeLay = route_layers[0];
                    routeLay.removeAllFeatures();
                }

                // Add features
                var wkt = new OpenLayers.Format.WKT();
                var wktData = data.route[0].geometries[0];
                if(!wktData) {
                    Ext.Msg.alert("Informations", "Aucune route n'a été trouvée");
                    return;
                }
                var features = wkt.read(wktData);
                if(features) {
                    if(features.constructor != Array) {
                        features = [features];
                    }
                    var bounds;
                    for(var i=0; i<features.length; ++i) {
                        if (!bounds) {
                            bounds = features[i].geometry.getBounds();
                        } else {
                            bounds.extend(features[i].geometry.getBounds());
                        }

                    }
                    routeLay.addFeatures(features);

                }
            },
            failure: function(response, options) {
                Ext.Msg.alert("Informations", "Impossible de récupérer la route");
            },
            scope: this
        });
    },

    /** private: method[initMetadataForm]
     *
     * Initialize metadata entry form.
     */
    initMetadataForm: function(){
        
        var titleField = new Ext.form.TextField({
            width: '95%',
            fieldLabel: this.metaDataMapTitle,
            value: this.about.title,
            allowBlank: false,
            enableKeyEvents: true,
            listeners: {
                "valid": function() {
                    saveAsButton.enable();
                    saveButton.enable();
                },
                "invalid": function() {
                    saveAsButton.disable();
                    saveButton.disable();
                }
            }
        });

        var abstractField = new Ext.form.TextArea({
            width: '95%',
            height: 200,
            fieldLabel: this.metaDataMapAbstract,
            value: this.about["abstract"]
        });

        var metaDataPanel = new Ext.FormPanel({
            bodyStyle: {padding: "5px"},          
            labelAlign: "top",
            items: [
                titleField,
                abstractField
            ]
        });

        metaDataPanel.enable();
        
        var saveAsButton = new Ext.Button({
            text: this.metadataFormSaveAsCopyText,
            disabled: !this.about.title,
            handler: function(e){
                this.about.title = titleField.getValue();
                this.about["abstract"] = abstractField.getValue();
                this.metadataForm.hide();
                this.save(true);
            },
            scope: this
        });
        var saveButton = new Ext.Button({
            text: this.metadataFormSaveText,
            disabled: !this.about.title,
            handler: function(e){
                this.about.title = titleField.getValue();
                this.about["abstract"] = abstractField.getValue();
                this.metadataForm.hide();
                this.save();
            },
            scope: this
        });

        this.metadataForm = new Ext.Window({
            title: this.metaDataHeader,
            closeAction: 'hide',
            items: metaDataPanel,
            modal: true,
            width: 400,
            autoHeight: true,
            bbar: [
                "->",
                saveAsButton,
                saveButton,
                new Ext.Button({
                    text: this.metadataFormCancelText,
                    handler: function() {
                        titleField.setValue(this.about.title);
                        abstractField.setValue(this.about["abstract"]);
                        this.metadataForm.hide();
                    },
                    scope: this
                })
            ]
        });
    },

    /** private: method[showMetadataForm]
     *  Shows the window with a metadata form
     */
    showMetadataForm: function() {
        if(!this.metadataForm) {
            this.initMetadataForm();
        }

        this.metadataForm.show();
    },

    updateURL: function() {
        /* PUT to this url to update an existing map */
        return this.rest + this.mapID + '/data';
    },

    /** api: method[save]
     *  :arg as: ''Boolean'' True if map should be "Saved as..."
     *
     *  Subclasses that load config asynchronously can override this to load
     *  any configuration before applyConfig is called.
     */
    save: function(as){
        var config = this.getState();
        
        if (!this.mapID || as) {
            /* create a new map */ 
            Ext.Ajax.request({
                url: this.rest,
                method: 'POST',
                jsonData: config,
                success: function(response, options) {
                    var id = response.getResponseHeader("Location");
                    // trim whitespace to avoid Safari issue where the trailing newline is included
                    id = id.replace(/^\s*/,'');
                    id = id.replace(/\s*$/,'');
                    id = id.match(/[\d]*$/)[0];
                    this.mapID = id; //id is url, not mapID
                    this.fireEvent("saved", id);
                }, 
                scope: this
            });
        }
        else {
            /* save an existing map */
            Ext.Ajax.request({
                url: this.updateURL(),
                method: 'PUT',
                jsonData: config,
                success: function(response, options) {
                    /* nothing for now */
                    this.fireEvent("saved", this.mapID);
                }, 
                scope: this
            });         
        }
    }
});
