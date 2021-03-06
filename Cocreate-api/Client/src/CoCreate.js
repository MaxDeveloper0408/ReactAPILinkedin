/**
 * Created by jean
 * 2020-06-08
 */

const CoCreateInit = {
    modules: {},
    newModules: {},
    observer: null,

    /**
     * key: module name
     * instance: module instance (ex, CoCreateInput or window)
     * initFunc: function instance for init
     */
    register: function (key, instance, initFunc) {
        if (this.modules[key]) {
            return;
        }
        this.modules[key] = {
            func: initFunc,
            instance: instance
        }
    },

    init: function () {
        if (this.observer) {
            return;
        }
        try {
            const self = this;
            this.observer = new MutationObserver(function (mutations) {
                self.mutationLogic(mutations)
            });
            const config = { attribute: false, childList: true, characterData: false, subtree: true };
            this.observer.observe(document.body, config);
        } catch (error) {

        }
    },

    registerModules: function (key, instance, initFunc) {
        if (this.newModules[key]) {
            return;
        }
        this.newModules[key] = {
            func: initFunc,
            instance: instance
        }
    },

    runInit: function (container) {
        // console.log(this.newModules, container)
        for (let [key, value] of Object.entries(this.newModules)) {
            value['func'].call(value['instance'], container);
        }
    },

    mutationLogic: function (mutations) {
        const self = this;
        // console.log('mutations event.....');
        mutations.forEach(function (mutation) {
            // if (mutation.type == "childList" && mutation.addedNodes.length == 1) {
            // 	const addedNode = mutation.addedNodes.item(0);
            // 	if (!self.modules) {
            // 		return;
            // 	}

            //     if (!addedNode.querySelectorAll || !addedNode.getAttribute) { 
            //       return;
            //     }

            // 	for (let [key, value] of Object.entries(self.modules)) {
            // 		value['func'].call(value['instance'], addedNode);
            // 		// let items = addedNode.querySelectorAll(value['selector']);
            // 		// items.forEach(el => {
            // 		// 	console.log('init element with observer', key);
            // 		// 	value['func'].call(value['instance'], el);
            // 		// })
            // 	}
            // }

            if (mutation.type == "childList" && mutation.addedNodes.length > 0) {
                if (!self.modules) {
                    return;
                }
                mutation.addedNodes.forEach((node) => {
                    if (!node.querySelectorAll || !node.getAttribute) {
                        return;
                    }

                    for (let [key, value] of Object.entries(self.modules)) {
                        value['func'].call(value['instance'], node);
                    }

                })
            }
        });
    },

    setInitialized: function (element) {
        element.initialized = true;
    },

    getInitialized: function (element) {
        if (!element.initialized) {
            return false;
        } else {
            return true;
        }
    }
}

CoCreateInit.init();
var CoCreateSocket = {
    sockets: new Map(),
    prefix: "crud",
    listeners: new Map(),
    messageQueue: new Map(),

    saveFileName: '',

    globalScope: "",

    setGlobalScope: function (scope) {
        this.globalScope = `${this.prefix}/${scope}`;
    },
    getGlobalScope: function () {
        return this.globalScope;
    },

    /**
     * config: {namespace, room, host}
     */
    create: function (config) {
        const { namespace, room } = config;
        const key = this.getKey(namespace, room);
        let _this = this;
        let socket;
        if (this.sockets.get(key)) {
            socket = this.sockets.get(key);
            console.log('SOcket already has been register');
            return;
        }

        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        let socket_url = `${protocol}://${location.host}/${key}`;
        if (config.host) {
            socket_url = `${protocol}://${config.host}/${key}`;
        }

        socket = new WebSocket(socket_url);

        socket.onopen = function (event) {
            console.log('created socket: ' + key);
            const messages = _this.messageQueue.get(key) || [];
            console.log(messages)
            messages.forEach(msg => socket.send(JSON.stringify(msg)));

            _this.sockets.set(key, socket);
            _this.messageQueue.set(key, []);
        }

        socket.onclose = function (event) {
            switch (event.code) {
                case 1000: // close normal
                    console.log("websocket: closed");
                    break;
                default:
                    _this.destroy(socket, key);
                    _this.reconnect(socket, config);
                    break;
            }
        }

        socket.onerror = function (err) {
            console.log('Socket error');
            _this.destroy(socket, key);
            _this.reconnect(socket, config);
        }


        socket.onmessage = function (data) {

            try {
                if (data.data instanceof Blob) {
                    _this.saveFile(data.data);
                    return;
                }
                let rev_data = JSON.parse(data.data);


                const listeners = _this.listeners.get(rev_data.action);
                if (!listeners) {
                    return;
                }
                listeners.forEach(listener => {
                    listener(rev_data.data, key);
                })
            } catch (e) {
                console.log(e);
            }
        }
    },

    /**
     * 
     */
    send: function (action, data, room) {
        const obj = {
            action: action,
            data: data
        }
        const key = this.getKeyByRoom(room);
        const socket = this.getByRoom(room);

        if (socket) {
            socket.send(JSON.stringify(obj));
        } else {
            if (this.messageQueue.get(key)) {
                this.messageQueue.get(key).push(obj);
            } else {
                this.messageQueue.set(key, [obj]);
            }
        }
    },

    sendFile: function (file, room) {
        const socket = this.getByRoom(room);
        if (socket) {
            socket.send(file);
        }
    },

    /**
     * scope: ns/room
     */
    listen: function (type, callback) {
        if (!this.listeners.get(type)) {
            this.listeners.set(type, [callback]);
        } else {
            this.listeners.get(type).push(callback);
        }
    },

    reconnect: function (socket, config) {
        let _this = this;
        setTimeout(function () {
            console.log('socket: reconnecting....');
            _this.create(config);
        }, 1000)
    },

    destroy: function (socket, key) {
        if (socket) {
            socket.onerror = socket.onopen = socket.onclose = null;
            socket.close();
            socket = null;
        }

        if (this.sockets.get(key)) {
            this.sockets.delete(key);
        }
    },

    getKey: function (namespace, room) {
        let key = `${this.prefix}`;
        if (namespace && namespace != '') {
            if (room && room != '') {
                key += `/${namespace}/${room}`;
            } else {
                key += `/${namespace}`;
            }
        }
        return key;
    },

    getByRoom: function (room) {
        let key = this.getKeyByRoom(room)
        return this.sockets.get(key);
    },

    getKeyByRoom: function (room) {
        let key = this.globalScope;
        if (room) {
            key = `${this.prefix}/${room}`;
        }
        return key;
    },


    saveFile: function (blob) {
        // const {filename} = window.saveFileInfo;

        const file_name = this.saveFileName || 'downloadFile';
        var a = document.createElement("a");
        document.body.appendChild(a);
        a.style = "display: none";

        let url = window.URL.createObjectURL(blob);
        a.href = url;
        a.download = file_name;
        a.click();
        window.URL.revokeObjectURL(url);

        this.saveFileName = ''
    }

    // getNSListeners: function(ns, data) {
    // 	let prefixKey = this.prefix + "/" + ns + "/";

    // 	while(!this.listeners.next().done) {
    // 		const [key, value] = this.listeners.next().value;
    // 		if (key.includes(prefixKey)) {
    // 			value.forEach(l => {
    // 				l(data);
    // 			})
    // 		}
    // 	}
    // }
}


/**
 * Created by jin
 * 2020-04-03
 */

CoCreateUtils = {

    generateUUID: function (length = 36) {

        // if (length == 10) {
        //   var result           = '';
        //   var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        //   var charactersLength = characters.length;
        //   for ( var i = 0; i < length; i++ ) {
        //     result += characters.charAt(Math.floor(Math.random() * charactersLength));
        //   }

        //   var dd = new Date().toTimeString();
        //   var random = dd.replace(/[\W_]+/g, "").substr(0,6);
        //   result += random;
        //   return result;
        // }

        let d = new Date().getTime();
        let d2 = (window.performance && window.performance.now && (window.performance.now() * 1000)) || 0;
        let pattern = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';

        if (length <= pattern.length) {
            pattern = pattern.substr(0, length);
        } else {
            let add_len = length - pattern.length;
            let sub_pattern = "-xxxyyxxx";

            let group_n = Math.floor(add_len / sub_pattern.length);

            for (let i = 0; i < group_n; i++) {
                pattern += sub_pattern;
            }

            group_n = add_len - group_n * sub_pattern.length;
            pattern += sub_pattern.substr(0, group_n);
        }

        let uuid = pattern.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16;
            if (d > 0) {
                var r = (d + r) % 16 | 0;
                d = Math.floor(d / 16);
            } else {
                var r = (d2 + r) % 16 | 0;
                d2 = Math.floor(d2 / 16);
            }
            return (c == 'x' ? r : (r & 0x7 | 0x8)).toString(16);
        });
        return uuid;
    },

    isRealTime: function (element, parent_realTime) {
        let realtime = element.getAttribute('data-realtime') || parent_realTime;
        if (realtime === "false") {
            return false;
        }

        return true
    },

    getParentFromElement: function (element, parent_class, attributes) {

        if (parent_class) {
            if (element.classList.contains(parent_class)) {
                return element;
            }

            let node = element.parentNode;
            while (node != null && node.classList) {
                if (node.classList.contains(parent_class)) {
                    return node;
                }
                node = node.parentNode;
            }

        } else if (attributes) {
            if (attributes.every((attr) => element.attributes.hasOwnProperty(attr))) {
                return element;
            }

            let node = element.parentNode;
            while (node != null && node.attributes) {
                if (attributes.every((attr) => node.attributes.hasOwnProperty(attr))) {
                    return node;
                }
                node = node.parentNode;
            }
        }

        return false;
    },

    isReadValue: function (element) {
        return element.getAttribute('data-read_value') != "false";
    },

    isJsonString: function (str_data) {
        try {
            let json_data = JSON.parse(str_data);
            if (typeof json_data === 'object' && json_data != null) {
                return true;
            } else {
                return false;
            }
        } catch (e) {
            return false;
        }
    },

}


// ***********   define variables  ***************** ///

var g_moduleSelectors = [];

// ***********   define variables end ***************** /// 

// CoCreateLogic.init();

function registerModuleSelector(selector) {
    if (g_moduleSelectors.indexOf(selector) === -1) {
        g_moduleSelectors.push(selector);
    }
}


// rename to initDeleteDocument
function initDeleteTags() {
    var dTags = document.querySelectorAll('.delete-document');

    for (var i = 0; i < dTags.length; i++) {
        var dTag = dTags[i];

        dTag.addEventListener('click', function (e) {
            e.preventDefault();

            var collection = this.getAttribute('data-collection') || 'module_activity';
            var documentId;

            documentId = this.getAttribute('data-document_id');

            if (document) {
                CoCreate.deleteDocument({
                    'collection': collection,
                    'document_id': documentId,
                    'metadata': ''
                });
            }
        })
    }
}

// this is for updating float label to active after data is inserted
function updateFloatLabel(node, value) { }

const CoCreate = {
    modules: {},
    socketInitFuncs: [],
    host: 'server.cocreate.app',

    init: function (host, namespace) {
        if (host) {
            this.host = host;
        }

        this.createGeneralSocket(host, namespace);
        this.initSocketListener();

        this.createUserSocket(host);
    },

    initSocketListener: function () {
        const self = this;

        CoCreateSocket.listen('connect', function (data, room) {

            if (room == CoCreateSocket.getGlobalScope()) {
                self.socketInitFuncs.forEach((func) => {
                    func.initFunc.call(func.instance);
                })
                initDeleteTags();
                // self.fetchModules();
            }
        })

        CoCreateSocket.listen('readDocument', function (data) {
            const metadata = data.metadata;
            if (metadata && metadata.type == 'crdt') {
                self.initRenderCrdtData(data);
            } else {
                // self.renderModules(data)
            }
        })

        CoCreateSocket.listen('updateDocument', function (data) {
            // self.renderModules(data)
        })

        CoCreateSocket.listen('deletedDocument', function (data) {
            console.log(data);
        })

        CoCreateSocket.listen('sendMessage', function (data) {
            console.log(data);
        })

        this.listenMessage('downloadFileInfo', function (data) {
            CoCreateSocket.saveFileName = data.file_name;
        })

    },

    createUserSocket: function (host) {
        var user_id = localStorage.getItem('user_id');
        if (user_id) {
            CoCreateSocket.create({
                namespace: 'users',
                room: user_id,
                host: host
            })
        }
    },

    createGeneralSocket: function (host, namespace) {
        if (namespace) {
            CoCreateSocket.create({
                namespace: namespace,
                room: null,
                host: host
            });
            CoCreateSocket.setGlobalScope(namespace);
        } else {
            CoCreateSocket.create({
                namespace: null,
                room: null,
                host: host
            });
        }
    },

    registerSocketInit: function (initFunc, instance) {
        this.socketInitFuncs.push({
            initFunc,
            instance: instance || window
        });
    },

    // registerModule: function(name, instance, initFunc, fetchFunc, renderFunc) {

    //   if (this.modules[name]) {
    //     return;
    //   }

    //   this.modules[name] = {
    //     instance, 
    //     fetchFunc,
    //     renderFunc,
    //     initFunc
    //   }
    // },

    /** Module Processing Functions **/
    // initModules: function(container) {
    //   let keys = Object.keys(this.modules);

    //   for (var i = 0; i < keys.length; i++) {
    //     const module = this.modules[keys[i]];
    //     if (module && module.initFunc) {
    //       module.initFunc.call(module['instance'], container);
    //     }
    //   }
    // },

    // runInitModule: function (key, container) {
    //   if (!this.modules[key]) {
    //     return;
    //   }
    //   const module = this.modules[key];
    //   module.initFunc.call(module['instance'], container);
    // },

    // fetchModules: function(container) {
    //   var fetchDocuments = []; 

    //   let keys = Object.keys(this.modules);
    //   for (var i = 0; i < keys.length; i++) {
    //     const module = this.modules[keys[i]]
    //     if (module && module.fetchFunc) {
    //       fetchDocuments = fetchDocuments.concat(module.fetchFunc.call(module['instance'], container));
    //     }
    //   }

    //   /** remove duplication information **/
    //   let fetchInfo = [];
    //   let _this = this;
    //   fetchDocuments.forEach((item) => {
    //     if (!fetchInfo.some((info) => (info['collection'] == item['collection'] && info['document_id'] === item['document_id']))) {
    //       _this.readDocument({
    //         'collection': item['collection'], 
    //         'document_id': item['document_id']
    //       });
    //       fetchInfo.push(item);
    //     }
    //   })
    // },

    // renderModules: function(data, container) {
    //   let keys = Object.keys(this.modules);

    //   for (var i = 0; i < keys.length; i++) {
    //     const key = keys[i];
    //     const module = this.modules[keys[i]];
    //     if (module && module.renderFunc) {
    //       module.renderFunc.call(module['instance'], data, container)
    //     }
    //   }
    // },


    /** Get common paraeter  **/
    getCommonParams: function () {
        return {
            "apiKey": config.apiKey,
            "securityKey": config.securityKey,
            "organization_id": config.organization_Id,
        }
    },


    /*
     
      readDcoumentList {
        collection: "modules",
        element: "xxxx",
        metadata: "",
        operator: {
          fetch: {
            name: 'xxxx',
            value: 'xxxxx'
          },
          filters: [{
            name: 'field1',
            operator: "contain | range | eq | ne | lt | lte | gt | gte | in | nin",
            value: [v1, v2, ...]
          }, {
            name: "_id",
            opreator: "in",
            value: ["id1"]
          }, {
            ....
          }],
          orders: [{
            name: 'field-x',
            type: 1 | -1
          }],
          search: {
            type: 'or | and',
            value: [value1, value2]
          },
          
          startIndex: 0 (integer),
          count: 0 (integer)
        },
        
        is_collection: true | false,
        //. case fetch document case
        created_ids : [id1, id2, ...],
        
        
        -------- additional response data -----------
        data: [] // array
      }
    */

    readDocumentList(info) {
        if (!info) return;
        let request_data = this.getCommonParams();

        if (!info.collection || !info.operator) {
            return;
        }

        request_data = { ...request_data, ...info };

        console.log(request_data)
        CoCreateSocket.send('readDocumentList', request_data);
    },


    /*
    createDocument({
      namespace:'',
      room:'',
      broadcast: true/false, (default=ture)
      broadcast_sender: true/false, (default=true) 
      
      collection: "test123",
      data:{
          name1:â€œhelloâ€,
          name2:  â€œhello1â€
      },
      element: â€œxxxxâ€,
      metaData: "xxxx"
    }),
    */
    createDocument: function (info) {
        if (info === null) {
            return;
        }
        let request_data = this.getCommonParams()
        request_data['collection'] = info['collection'] || 'module_activities';

        let data = info.data || {};

        if (!data['organization_id']) {
            data['organization_id'] = config.organization_Id
        }

        request_data['data'] = data;
        if (info['metadata']) {
            request_data['metadata'] = info['metadata']
        }

        request_data['element'] = info['element'];

        /** socket parameters **/
        // if (info['broadcast'] === undefined) {
        //   request_data['broadcast'] = true;
        // }
        // if (info['broadcast_sender'] === undefined) {
        //   request_data['broadcast_sender'] = true;
        // }

        const room = this.generateSocketClient(info.namespace, info.room);
        CoCreateSocket.send('createDocument', request_data, room);
    },

    generateSocketClient: function (namespace, room) {
        let ns = namespace || config.organization_Id
        let rr = room || '';
        if (rr) {
            return `${ns}/${rr}`
        } else {
            return ns;
        }
    },


    /*
    updateDocument({
      namespace: '',
      room: '',
      broadcast: true/false,
      broadcast_sender: true/false,
      
      collection: "test123",
      document_id: "document_id",
      data:{
          name1:â€œhelloâ€,
          name2:  â€œhello1â€
      },
      delete_fields:["name3", "name4"],
      element: â€œxxxxâ€,
      metaData: "xxxx"
    }),
    */
    updateDocument: function (info) {
        if (!info || !info['document_id']) return;

        let request_data = this.getCommonParams();
        request_data['collection'] = info['collection'] || 'module_activities';
        request_data['document_id'] = info['document_id'];

        if (typeof info['data'] === 'object') request_data['set'] = info['data'];
        if (Array.isArray(info['delete_fields'])) request_data['unset'] = info['delete_fields'];

        if (!request_data['set'] && !request_data['unset']) return;

        request_data['element'] = info['element'];
        request_data['metadata'] = info['metadata'];

        if (info.upsert) {
            request_data['upsert'] = true;
        }

        if (info.broadcast === false) {
            request_data['broadcast'] = false;
        }

        /** socket parameters **/
        // if (info['broadcast'] === undefined) {
        //   request_data['broadcast'] = true;
        // }
        request_data['broadcast_sender'] = info.broadcast_sender;
        if (info['broadcast_sender'] === undefined) {
            request_data['broadcast_sender'] = true;
        }

        const room = this.generateSocketClient(info.namespace, info.room);
        CoCreateSocket.send('updateDocument', request_data, room);
    },


    /*
    readDocument({
      collection: "test123",
      document_id: "document_id",
      element: â€œxxxxâ€,
      metaData: "xxxx",
      exclude_fields: [] 
    }),
    */
    readDocument: function (info) {
        if (info === null) {
            return;
        }
        if (!info['document_id'] || !info) {
            return;
        }

        let request_data = this.getCommonParams();
        request_data['collection'] = info['collection'];
        request_data['document_id'] = info['document_id'];
        if (info['exclude_fields']) {
            request_data['exclude_fields'] = info['exclude_fields'];
        }

        if (info['element']) {
            request_data['element'] = info['element'];
        }

        request_data['metadata'] = info['metadata']
        CoCreateSocket.send('readDocument', request_data);
    },


    /*
    deleteDocument({
      namespace: '',
      room: '',
      broadcast: true/false,
      broadcast_sender: true/false,
      
      collection: "module",
      document_id: "",
      element: â€œxxxxâ€,
      metadata: "xxxx"
    }),
    */
    deleteDocument: function (info) {
        if (!info['document_id'] || !info) {
            return;
        }

        let request_data = this.getCommonParams();
        request_data['collection'] = info['collection'];
        request_data['document_id'] = info['document_id'];

        if (info['element']) {
            request_data['element'] = info['element'];
        }

        request_data['metadata'] = info['metadata']

        /** socket parameters **/
        // if (info['broadcast'] === undefined) {
        //   request_data['broadcast'] = true;
        // }
        // if (info['broadcast_sender'] === undefined) {
        //   request_data['broadcast_sender'] = true;
        // }

        const room = this.generateSocketClient(info.namespace, info.room);
        CoCreateSocket.send('deleteDocument', request_data, room);
    },


    /*
      Private function to get id of ydoc
    */
    __getYDocId: function (collection, document_id, name) {
        if (!collection || !document_id || !name) {
            return null;
        }
        return CoCreateYSocket.generateID(config.organization_Id, collection, document_id, name);

    },

    /*. init data function
    replaceDataCrdt({
      collection: "module",
      document_id: "",
      name: "",
      value: "",
      update_crud: true | false,
      element: dom_object,
      metadata: "xxxx"
    })
    */

    replaceDataCrdt: function (info) {
        if (!info) return;

        const id = this.__getYDocId(info.collection, info.document_id, info.name)
        if (!id) return;
        if (info.update_crud || !CoCreateCrdt.getType(id)) {
            this.updateDocument({
                collection: info.collection,
                document_id: info.document_id,
                data: { [info.name]: info.value },
                element: info.element,
                metadata: info.metadata,
                namespace: info.namespace,
                room: info.room,
                broadcast: info.broadcast,
                upsert: info.upsert,
                broadcast_sender: info.broadcast_sender
            })

        } else {
            let oldData = CoCreateCrdt.getType(id).toString();
            CoCreateCrdt.deleteData(id, 0, Math.max(oldData.length, info.value.length));
            CoCreateCrdt.insertData(id, 0, info.value);

        }

    },

    /*
    inintDataCrdt({
      collection: "module",
      document_id: "",
      name: "",
      element: dom_object,
      metadata: "xxxx"
    })
    */
    initDataCrdt: function (info) {
        try {
            this.validateKeysJson(info, ['collection', 'document_id', 'name']);

            const id = this.__getYDocId(info['collection'], info['document_id'], info['name'])

            if (!id) return;
            const status = CoCreateCrdt.createDoc(id, info.element)
            console.log("InitCrdt")
        } catch (e) {
            console.log('Invalid param', e);
        }
    },


    validateKeysJson: function (json, rules) {
        let keys_json = Object.keys(json);
        keys_json.forEach(key => {
            const index = rules.indexOf(key);
            if (index != -1)
                rules.splice(index, 1);
        });
        if (rules.length)
            throw "Requires the following " + rules.toString();
    },


    /*
    CoCreate.insertDataCrdt({
          collection: 'module_activities',
          document_id: '5e4802ce3ed96d38e71fc7e5',
          name: 'name',
          value: 'T',
          position:'8
          attributes: {bold: true}
    })
    */
    insertDataCrdt: function (info) {
        try {
            this.validateKeysJson(info, ['collection', 'document_id', 'name', 'value', 'position']);
            let id = this.__getYDocId(info['collection'], info['document_id'], info['name'])
            if (id) {
                CoCreateCrdt.insertData(id, info['position'], info['value'], info['attributes']);
            }
        }
        catch (e) {
            console.error(e);
        }
    }, //end inserData


    /*
    CoCreate.deleteDataCrdt({
          collection: 'module_activities',
          document_id: '5e4802ce3ed96d38e71fc7e5',
          name: 'name',
          position:8,
          length:2,
    })
    */
    deleteDataCrdt: function (info) {
        try {
            this.validateKeysJson(info, ['collection', 'document_id', 'name', 'position', 'length']);
            let id = this.__getYDocId(info['collection'], info['document_id'], info['name'])
            if (id) {
                CoCreateCrdt.deleteData(id, info['position'], info['length']);
            }
        }
        catch (e) {
            console.error(e);
        }
    },


    /*
    CoCreate.getDataCrdt({
          collection: 'module_activities',
          document_id: '5e4802ce3ed96d38e71fc7e5',
          name: 'name'
    })
    */
    getDataCrdt: function (info) {
        try {
            this.validateKeysJson(info, ['collection', 'document_id', 'name']);
            let id = this.__getYDocId(info['collection'], info['document_id'], info['name'])
            if (id) {
                return CoCreateCrdt.getWholeString(id);
            } else {
                return "";
            }
        }
        catch (e) {
            console.error(e);
        }
    },


    /*  
    CoCreate.sendPosition({
        collection:"module_activities",
        document_id:"5e4802ce3ed96d38e71fc7e5",
        name:"name",
        startPosition: 2,
        endPositon: 2,
    })
    */
    sendPosition: function (json) {
        CoCreateCrdt.sendPosition(json);
    },


    /* 
    CoCreate.getPosition(function(data))
    CoCreate.getPosition(function(data){console.log(" EScuchando ahora  ",data)})
    */
    getPosition: function (callback) {
        if (typeof miFuncion === 'function')
            CoCreateCrdt.changeListenAwereness(callback);
        else
            console.error('Callback should be a function')
    },


    /*
    CoCreate.sendMessage({
       namespace: '',
       room: '',
       broadcast: true/false,
       broadcast_sender: true/false
       
       rooms: [r1, r2],
       emit: {
         message': 'nice game',
         data': 'let's play a game ....'
       }
     })
    */
    sendMessage: function (data) {
        let request_data = this.getCommonParams();

        if (!data || !data.emit) {
            return;
        }
        request_data = { ...request_data, ...data }

        /** socket parameters **/
        // if (data['broadcast'] === undefined) {
        //   request_data['broadcast'] = true;
        // }
        // if (data['broadcast_sender'] === undefined) {
        //   request_data['broadcast_sender'] = true;
        // }
        const room = this.generateSocketClient(data.namespace, data.room);

        CoCreateSocket.send('sendMessage', request_data, room)
    },

    listenMessage: function (message, fun) {
        CoCreateSocket.listen(message, fun);
    },

    createSocket: function (config) {
        CoCreateSocket.create(config);
    },

    /* 
    config: 
    {
       namespace, 
       room
    }
    */
    destroySocket: function (config) {
        const { namespace, room } = config;
        const key = CoCreateSocket.getKey(namespace, room);
        let socket = CoCreateSocket.sockets.get(key);

        if (!socket) {
            return
        }
        CoCreateSocket.destroy(socket, key);
    },

    initRenderCrdtData: function (data) {
        const metadata = data.metadata
        const id = metadata.id;
        const selected_doc = CoCreateCrdt.docs[id];
        if (!selected_doc) return;

        const info = CoCreateYSocket.parseTypeName(id);

        console.log(selected_doc.socket.awareness.getStates().size);

        console.log(CoCreateCrdt.getWholeString(id))
    },


    /** export / import db functions **/

    /*
   readDocument({
     collection: "test123",
     element: â€œxxxxâ€,
     metaData: "xxxx",
   }),
   */
    exportCollection: function (info) {
        if (info === null) {
            return;
        }

        let request_data = this.getCommonParams();
        request_data['collection'] = info['collection'];
        request_data['export_type'] = info['export_type'];

        request_data['metadata'] = info['metadata']
        CoCreateSocket.send('exportDB', request_data);
    },

    /*
    readDocument({
      collection: "test123",
      file: file
    }),
    */
    importCollection: function (info) {
        const { file } = info;
        if (info === null || !(file instanceof File)) {
            return;
        }

        const extension = file.name.split(".").pop();

        if (!['json', 'csv'].some((item) => item === extension)) {
            return;
        }

        let request_data = this.getCommonParams()
        request_data['collection'] = info['collection']
        request_data['import_type'] = extension;
        CoCreateSocket.send('importDB', request_data)
        CoCreateSocket.sendFile(file);
    }

    /**
    Functions YJS
    */
}


CoCreate.init(config.host ? config.host : 'server.cocreate.app:8088', config.organization_Id);

window.CoCreate = CoCreate

// 'use restrict'

const CoCreateFloatLabel = {
    className: 'floating-label_field',

    init: function () {
        this.initElement()
    },

    initElement: function (container) {
        const self = this;

        let mainContainer = container || document;
        if (!mainContainer.querySelectorAll) {
            return;
        }

        let elements = mainContainer.querySelectorAll('.floating-label');

        if (elements.length == 0 && mainContainer.classList && mainContainer.classList.contains('floating-label')) {
            elements = [mainContainer];
        }

        elements.forEach(el => {
            self.render(el);
            self.__initEvents(el)
        })
    },

    render: function (node) {
        if (!node.parentNode.classList.contains(this.className)) {
            const placeholder = node.getAttribute('placeholder');
            const wrapper = document.createElement('div');
            node.setAttribute("placeholder", "")
            wrapper.className = this.className;
            this.__wrap(node, wrapper, placeholder);
            this.update(node);
        }
    },

    update: function (node, value) {
        if (node.classList.contains('floating-label') && node.parentNode.classList.contains('floating-label_field')) {
            const parent = node.parentNode;
            if (node.value || value) {
                node.classList.add("text_color");
                parent.classList.add('active');
            } else {
                node.classList.remove("text_color");
                parent.classList.remove('active');
            }
        }
    },

    __wrap: function (el, wrapper, placeholder) {
        el.parentNode.insertBefore(wrapper, el);
        var div1 = document.createElement('div');
        div1.className = "floating-label_outline";
        var div2 = document.createElement('div');
        div2.className = "floating-label_leading";
        var div3 = document.createElement('div');
        div3.className = "floating-label_notch";
        var label = document.createElement('label');
        label.className = "floating-label_label";
        label.innerHTML = placeholder;
        var div4 = document.createElement('div');
        div4.className = "floating-label_trailing";
        div1.appendChild(div2);
        div3.appendChild(label);
        div1.appendChild(div3);
        div1.appendChild(div4);

        wrapper.appendChild(div1);
        wrapper.appendChild(el);
    },

    __initEvents: function (node) {

        node.addEventListener('focus', (event) => {
            const inputContent = node.value;
            const tag_name = node.tagName.toLowerCase()
            if (inputContent == '' || tag_name == 'select') {
                node.classList.add("text_color");
                parent = node.closest("div");
                parent.classList.add("active");
            }
        });

        node.addEventListener('blur', (event) => {
            const inputContent = node.value;
            if (inputContent == '') {
                node.classList.remove("text_color");
                parent = node.closest("div");
                parent.classList.remove("active");
            }
        });



        node.addEventListener('CoCreateSelect-open', function (e) {
            let parent = this.parentNode;
            parent.classList.add('active');
        })

        node.addEventListener('CoCreateSelect-close', function (e) {
            if (!CoCreateSelect) return;
            let value = CoCreateSelect.getValue(this);

            if (!value || value.length == 0) this.parentNode.classList.remove('active');
        })

        node.addEventListener('selectedValue', function (e) {
            if (!CoCreateSelect) return;
            let value = CoCreateSelect.getValue(this);

            if (value && value.length > 0) {
                this.parentNode.classList.add('active');
            } else {
                this.parentNode.classList.remove('active');
            }
        })
    },

}

CoCreateFloatLabel.init();
CoCreateInit.register('CoCreateFloatLabel', CoCreateFloatLabel, CoCreateFloatLabel.initElement);


const CoCreateLogic = {

    init: function () {
        this.__initKeys();
        this.__initPassSessionIds();
        this.__initPassParams();
        this.__initPassValueParams();
        this.__initValuePassBtns();
        this.__initGetValueInput();

        this.__initLink();
    },

    // getKeys
    __initKeys: function () {
        if (localStorage.getItem('apiKey')) {
            config.apiKey = localStorage.getItem('apiKey');
        }
        if (localStorage.getItem('securityKey')) {
            config.securityKey = localStorage.getItem('securityKey');
        }
        if (localStorage.getItem('organization_id')) {
            config.organization_Id = localStorage.getItem('organization_id');
        }
    },

    //. passSessionIds
    __initPassSessionIds: function () {
        let orgId = localStorage.getItem('organization_id');
        let user_id = localStorage.getItem('user_id');
        let adminUI_id = localStorage.getItem('adminUI_id');
        let builderUI_id = localStorage.getItem('builderUI_id');

        this.__initPassItems(orgId, ".sessionOrg_Id", true);
        this.__initPassItems(user_id, ".sessionUser_Id");
        this.__initPassItems(adminUI_id, ".sessionAdminUI_Id");
        this.__initPassItems(builderUI_id, ".sessionBuilderUI_Id");
    },

    //. passParams
    __initPassParams: function () {
        var dataParams = localStorage.getItem('dataParams');
        dataParams = JSON.parse(dataParams);

        if (!dataParams || dataParams.length == 0) return;
        let self = this;
        dataParams.forEach(function (dataParam) {
            var param_collection = dataParam.collection;
            var param_document_id = dataParam.document_id;
            var param_prefix = dataParam.prefix;
            var param_pass_to = dataParam.pass_to;

            var forms = document.querySelectorAll('form');

            forms.forEach((form) => {
                var pass_id = form.getAttribute('data-pass_id');
                if (pass_id && pass_id == param_pass_to && param_collection && param_collection != "") {
                    if (!form.getAttribute('data-collection')) {
                        form.setAttribute('data-collection', param_collection);
                    }
                }
            })

            var allTags = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, i, q, a, b, li, ul, span, code, img, head, body, input, textarea, select, table, div, html');

            allTags.forEach((tag) => {
                var pass_id = tag.getAttribute('data-pass_id');
                if (pass_id && pass_id == param_pass_to && param_document_id) {
                    self.__setAttributeIntoEl(tag, param_document_id)

                    if (tag.hasAttribute('name') && param_prefix) {
                        tag.setAttribute('name', param_prefix + tag.getAttribute('name'));
                    }
                }
            })

            var displayList = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, i, q, a, b, li, ul, span, code, img, head, body, table, html, div');

            displayList.forEach((display) => {
                var pass_id = display.getAttribute('data-pass_id');

                if (pass_id && pass_id == param_pass_to) {
                    // if (!display.getAttribute('data-fetch_value')) {
                    // 	display.setAttribute('data-fetch_value', param_document_id);
                    // }

                    if (display.classList.contains('template-wrapper')) {
                        if (dataParam.fetch_name) {
                            display.setAttribute('data-fetch_name', dataParam.fetch_name);
                        }

                        if (dataParam.fetch_value) {
                            display.setAttribute('data-fetch_value', dataParam.fetch_value);
                        }
                    }

                    if (param_collection && param_collection != "") {
                        if (!display.getAttribute('data-collection')) {
                            display.setAttribute('data-collection', param_collection);
                        }

                        if (!display.getAttribute('data-pass_collection')) {
                            display.setAttribute('data-pass_collection', param_collection);
                        }

                        if (!display.getAttribute('data-fetch_collection')) {
                            display.setAttribute('data-fetch_collection', param_collection);
                        }

                    }

                    if (param_prefix) {
                        display.setAttribute('prefix', param_prefix);
                        display.setAttribute('data-pass_prefix', param_prefix);
                    }
                }
            })
        })
    },

    // passValueParams
    __initPassValueParams: function (contianer) {
        var valueParams = localStorage.getItem('valueParams');
        valueParams = JSON.parse(valueParams);

        if (!valueParams || valueParams.length == 0) return;

        valueParams.forEach(function (valueParam) {
            var pass_value_to = valueParam.pass_value_to;
            // var inputs = (contianer || document).querySelectorAll('input, textarea, select');
            var inputs = (contianer || document).querySelectorAll('[data-pass_value_id]');

            inputs.forEach((input) => {
                let pass_value_id = input.getAttribute('data-pass_value_id');

                if (pass_value_id && pass_value_id == pass_value_to) {
                    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(input.tagName)) {
                        input.value = valueParam.value;
                        if (CoCreateFloatLabel) CoCreateFloatLabel.update(input)
                    } else {
                        input.innerHTML = valueParam.value;
                    }
                }
            })
        })
    },

    //. storePassData
    storePassData: function (aTag) {
        var dataParams = [];

        var collection = aTag.getAttribute('data-pass_collection');
        var document_id = aTag.getAttribute('data-pass_document_id');
        var prefix = aTag.getAttribute('data-pass_prefix');
        var pass_to = aTag.getAttribute('data-pass_to');
        var pass_fetch_name = aTag.getAttribute('data-pass_fetch_name')
        var pass_fetcn_value = aTag.getAttribute('data-pass_fetch_value')

        if (aTag.hasAttribute('data-actions')) {
            return;
        }

        if (pass_to) {
            var param = {
                collection: collection,
                document_id: document_id,
                prefix: prefix,
                pass_to: pass_to,
                fetch_name: pass_fetch_name,
                fetch_value: pass_fetcn_value
            };

            dataParams.push(param);
            this.initTemplateByPass(pass_to, param);
        }

        var tags = aTag.querySelectorAll('[data-pass_to]');

        tags.forEach((tag) => {
            const collection = tag.getAttribute('data-pass_collection');
            const document_id = tag.getAttribute('data-pass_document_id');
            const prefix = tag.getAttribute('data-pass_prefix');
            const pass_to = tag.getAttribute('data-pass_to');
            const pass_fetch_name = aTag.getAttribute('data-pass_fetch_name')
            const pass_fetcn_value = aTag.getAttribute('data-pass_fetch_value')

            if (pass_to) {
                var param = {
                    collection: collection,
                    document_id: document_id,
                    prefix: prefix,
                    pass_to: pass_to,
                    fetch_name: pass_fetch_name,
                    fetch_value: pass_fetcn_value
                };

                dataParams.push(param);
            }
        })

        if (dataParams.length > 0) localStorage.setItem('dataParams', JSON.stringify(dataParams));
    },

    //. initTemplateByPass
    initTemplateByPass: function (pass_id, param) {
        let templates = document.querySelectorAll('.template-wrapper[data-pass_id="' + pass_id + '"]')

        for (var i = 0; i < templates.length; i++) {
            let tmp = templates[i];
            tmp.setAttribute('data-fetch_collection', param.collection);
            if (param.fetch_name) {
                tmp.setAttribute('data-fetch_name', param.fetch_name)
            }
            if (param.fetch_value) {
                tmp.setAttribute('data-fetch_value', param.fetch_value)
            }
            initTemplateByElement(tmp, true);
        }
    },

    //. initValuePassBtns
    __initValuePassBtns: function () {
        let forms = document.getElementsByTagName('form');

        for (let i = 0; i < forms.length; i++) {
            let form = forms[i];

            let valuePassBtn = form.querySelector('.passValueBtn');

            if (valuePassBtn) this.__registerValuePassBtnEvent(form, valuePassBtn);
        }
    },

    __initGetValueInput: function () {
        var inputs = document.querySelectorAll('input, textarea');
        let self = this;

        for (var i = 0; i < inputs.length; i++) {
            var input = inputs[i];

            if (!input.id) {
                continue;
            }

            input.addEventListener('input', function (e) {
                self.__setGetValueProcess(this.id, this.value)
            })

            input.addEventListener('updated_by_fetch', function (e) {
                self.__setGetValueProcess(this.id, this.value);
            })
        }
    },

    //. initValuePassBtn
    __registerValuePassBtnEvent: function (form, valuePassBtn) {
        let self = this;
        valuePassBtn.addEventListener('click', function (e) {
            let inputs = form.querySelectorAll('input, textarea, select');

            if (valuePassBtn.hasAttribute('data-actions')) {
                return;
            }

            let valueParams = [];

            for (let i = 0; i < inputs.length; i++) {
                let input = inputs[i];

                let pass_value_to = input.getAttribute('data-pass_value_to');
                let value = input.value;

                if (pass_value_to) {
                    valueParams.push({
                        pass_value_to: pass_value_to,
                        value: value
                    })
                }
            }

            if (valueParams.length > 0) localStorage.setItem('valueParams', JSON.stringify(valueParams));

            self.__initPassValueParams();

            let aTag = valuePassBtn.querySelector('a');

            if (aTag) self.setLinkProcess(aTag);
        })
    },

    setDataPassValues: function (values) {
        const valueParams = []
        for (let key in values) {
            valueParams.push({
                pass_value_to: key,
                value: values[key]
            })
        }

        if (valueParams.length > 0) {
            localStorage.setItem('valueParams', JSON.stringify(valueParams));
        }
    },

    initDataPassValues: function () {
        localStorage.removeItem('valueParams');
    },


    __initLink: function () {
        var aTags = document.getElementsByTagName('a, button');
        for (var i = 0; i < aTags.length; i++) {
            this.initATagEvent(aTags[i]);
        }
    },

    //. initATag
    initATagEvent: function (aTag) {

        var href = aTag.getAttribute('href');
        var isModal = this.checkOpenCocreateModal(aTag);
        let self = this;

        if (isModal) {
            return;
        }


        if (href) {
            aTag.addEventListener('click', function (e) {
                e.preventDefault();
                if (aTag.hasAttribute('data-actions')) {
                    return;
                }
                if (!self.passSubmitProcess(aTag)) {
                    return;
                }
                self.storePassData(aTag);
                self.openAnother(aTag);
            })
        } else {
            aTag.addEventListener('click', function (e) {
                if (!self.passSubmitProcess(aTag)) {
                    return;
                }
                if (aTag.hasAttribute('data-actions')) {
                    return;
                }
                self.storePassData(aTag);
                self.__initPassParams();
                // CoCreate.fetchModules()
            })
        }
    },

    //. openAnother
    openAnother: function (atag) {

        var href = atag.getAttribute('href');
        var target = atag.getAttribute('target');

        if (target == "_blank") {
            window.open(href, "_blank");
        } else if (target == "_window") {
            window.open(href, '_blank', 'location=yes,height=570,width=520,scrollbars=yes,status=yes');
        } else {
            window.open(href, "_self");
        }
    },

    //. clickATaginButton
    setLinkProcess: function (aTag) {

        if (aTag.hasAttribute('data-actions')) {
            return;
        }

        var href = aTag.getAttribute('href');
        this.storePassData(aTag);
        if (this.checkOpenCocreateModal(aTag)) {
            if (g_cocreateWindow) {
                g_cocreateWindow.openWindow(aTag);
            }
        } else if (href) {
            this.openAnother(aTag);
        } else {
            this.__initPassParams();
            //init();
            // CoCreate.fetchModules()
        }
    },

    //. checkOpenCocreateModal
    checkOpenCocreateModal: function (atag) {
        if (atag.getAttribute('target') === "modal") {
            return true;
        }
        return false;
    },

    passSubmitProcess: function (element) {
        if (element.parentNode.classList.contains('submitBtn')) {
            if (element.getAttribute('data-pass_to') && element.getAttribute('data-pass_document_id')) {
                return true;
            } else {
                return false
            }
        } else {
            return true;
        }
    },


    __setGetValueProcess: function (id, value) {

        if (!id) return;

        var targets = document.querySelectorAll('[data-get_value="' + id + '"]');

        targets.forEach((target) => {
            // target.value = value;
            if (typeof (target.value) != "undefined") {
                target.value = value;
            } else if (typeof (target.textContent) != "undefined") {
                target.textContent = value;
            }

            if (CoCreateFloatLabel) CoCreateFloatLabel.update(target)

            target.dispatchEvent(new Event("input", { "bubbles": true }));

            if (target.classList.contains('searchInput')) {
                let evt = new KeyboardEvent('keydown', { 'keyCode': 13 });
                target.dispatchEvent(evt);
            }
        })
    },

    __initPassItems: function (id, selector, noFetch) {
        const self = this;
        if (id) {
            let elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                self.__setAttributeIntoEl(el, id, noFetch);
            })
        }
    },

    __setAttributeIntoEl: function (el, id, noFetch) {

        el.setAttribute('data-document_id', id);
        if (noFetch) {
            el.setAttribute('data-fetch_document_id', id);
        }
        // el.setAttribute('data-fetch_value', id);
        el.setAttribute('data-pass_document_id', id);
    }
}


const CoCreateAttributes = {
    //. key: colleciton.document_id.name,
    //. example:  
    /** modules.xxxxx.test: [
     *	{el: element, attr: 'data-test1'},
     *	{el: element, attr: 'data-test2'}
     * ]
     * 
     **/
    mainInfo: {},

    init: function () {
        // CoCreate.registerModule('fetch-attributes', this, null, this.getRequest, this.renderAttribute);
        const self = this;
        CoCreateSocket.listen('updateDocument', function (data) {
            self.render(data)
        })

        CoCreateSocket.listen('readDocument', function (data) {
            self.render(data)
        })

        CoCreateSocket.listen('connect', function (data) {
            // self.getRequest()
            self.__getRequest()
        })
    },

    initElement: function (container) {
        const requests = this.__getRequest(container)

        if (requests) {

            requests.forEach((req) => {
                CoCreate.readDocument({
                    collection: req['collection'],
                    document_id: req['document_id']
                })
            })
        }
    },

    render: function (data) {
        const collection = data['collection'];
        const document_id = data['document_id'];

        for (let name in data.data) {
            const key = this.__makeKey(collection, document_id, name)
            const value = data.data[name];
            if (this.mainInfo[key]) {
                this.mainInfo[key].forEach((item) => {
                    item.el.setAttribute(item.attr, value);

                    // if (item.attr == 'data-collection') {
                    // 	CoCreate.runInitModule('cocreate-text');						
                    // } 

                    item.el.dispatchEvent(new CustomEvent('CoCreateAttribute-run', {
                        eventType: 'rendered',
                        item: item.el
                    }))
                })
            }
        }
    },

    setValue: function (element, data) {

    },

    __getRequest: function (container) {
        let fetch_container = container || document;
        let elements = fetch_container.querySelectorAll('[fetch-for]');
        let self = this;

        let requestData = [];

        if (elements.length === 0 && fetch_container != document && fetch_container.hasAttributes('fetch-for')) {
            elements = [fetch_container];
        }

        elements.forEach((el) => {
            //. check
            const el_collection = el.getAttribute('data-collection')
            const el_documentId = el.getAttribute('data-document_id')
            const el_name = el.getAttribute('name')

            const attributes = el.attributes;

            for (let i = 0; i < attributes.length; i++) {
                let jsonInfo = self.__jsonParse(attributes[i].value);
                if (jsonInfo) {
                    let collection = jsonInfo['collection'] || el_collection;
                    let document_id = jsonInfo['document_id'] || el_documentId;
                    let name = jsonInfo['name'] || el_name;

                    if (jsonInfo['data-pass_id']) {
                        let pass_info = self.__checkPassId(jsonInfo['data-pass_id']);
                        if (pass_info) {
                            collection = pass_info.collection;
                            document_id = pass_info.document_id;
                        } else {
                            collection = null;
                            document_id = null;
                        }
                    }

                    const key = self.__makeKey(collection, document_id, name);

                    if (collection && document_id && name) {
                        if (!self.mainInfo[key]) {
                            self.mainInfo[key] = [];
                        }
                        self.mainInfo[key].push({ el: el, attr: attributes[i].name })

                        if (!requestData.some((d) => d['collection'] === collection && d['document_id'] === document_id)) {
                            requestData.push({ collection, document_id })
                        }
                    }
                }
            }
        })
        return requestData;
    },

    __jsonParse: function (str_data) {
        try {
            let json_data = JSON.parse(str_data);
            if (typeof json_data === 'object' && json_data != null) {
                return json_data;
            } else {
                return null;
            }
        } catch (e) {
            return null;
        }
    },

    __checkPassId: function (pass_id) {
        var dataParams = localStorage.getItem('dataParams');
        dataParams = JSON.parse(dataParams);

        if (!dataParams || dataParams.length == 0) return null;

        for (var i = 0; i < dataParams.length; i++) {
            if (dataParams[i].pass_to == pass_id) {
                return {
                    collection: dataParams[i].collection,
                    document_id: dataParams[i].document_id
                };
            }
        }
        return null;
    },

    __makeKey: function (collection, document_id, name) {
        return `${collection}_${document_id}_${name}`;
    },
}


CoCreateAttributes.init();
CoCreateLogic.init();
CoCreateInit.register('CoCreateAttributes', CoCreateAttributes, CoCreateAttributes.initElement);

const CoCreateRoom = {

    init: function (container) {
        let mainContainer = container || document;
        if (!mainContainer.querySelectorAll) {
            return;
        }

        let elements = mainContainer.querySelectorAll('[data-namespace], [data-room]');

        let clients = {};
        elements.forEach((el) => {
            if (el.isUsedForRoom) {
                return;
            }
            const host = CoCreate.host;
            let namespace = el.getAttribute('data-namespace');
            let room = el.getAttribute('data-room') || ''
            if (!namespace) {
                namespace = config.organization_Id;
            }

            let key = `${namespace}`;
            if (room) {
                key = `${namespace}/${room}`
            }

            if (!clients[key]) {
                CoCreateSocket.create({
                    namespace,
                    room,
                    host
                })

                clients[key] = true;
            }

            el.isUsedForRoom = true;
        });
    }
}

CoCreateRoom.init();

const CoCreateDocument = {

    requestAttr: "data-document_request",

    init: function () {
        const self = this;
        CoCreateSocket.listen('createDocument', function (data) {
            self.__receivedDocumentId(data);
        })
    },

    checkID: function (element, attr = "data-document_id") {
        let document_id = element.getAttribute(attr) || "";

        if (document_id === "" || document_id === "pending") {
            return false;
        }
        return true;
    },

    requestDocumentId: function (element, nameAttr = "name", value = null) {
        //. check element
        const collection = element.getAttribute('data-collection')
        const name = element.getAttribute(nameAttr)

        if (!collection || !name) {
            return
        }

        const request_id = CoCreateUtils.generateUUID();

        element.setAttribute(this.requestAttr, request_id);
        /* FixME Create Document request */
        CoCreate.createDocument({
            "collection": collection,
            "element": request_id,
            "metadata": "",
        })
    },

    requestDocumentIdOfForm: function (form) {

        let self = this;
        let elemens = form.querySelectorAll('[name], [data-pass_to]')

        let collections = [];

        for (var i = 0; i < elemens.length; i++) {
            let el = elemens[i];
            if (el.parentNode.classList.contains('template')) {
                continue;
            }
            const collection = el.getAttribute("data-collection") || el.getAttribute("data-pass_collection") || "";

            if (
                collection !== "" &&
                !collections.includes(collection) &&
                (!self.checkID(el, 'data-document_id') && !self.checkID(el, 'data-pass_document_id'))
            ) {
                const request_id = CoCreateUtils.generateUUID();
                collections.push(collection);

                el.setAttribute(this.requestAttr, request_id);
                /* FixME Create Document request */
                CoCreate.createDocument({
                    "collection": collection,
                    "element": request_id,
                    "metadata": "",
                })
            }
        }
    },

    __setID: function (element, document_id, attr) {
        if (!this.checkID(element, attr)) {
            element.setAttribute(attr, document_id);
        }
    },

    __setNewIdProcess: function (element, document_id, pass) {
        if (!element) return;

        element.removeAttribute(this.requestAttr);
        var status = false;
        const event_data = {
            document_id: document_id,
        }

        if (!pass && !this.checkID(element)) {
            if (element.hasAttribute('name')) {
                element.setAttribute('data-document_id', document_id);
                status = true;
            }
        }

        if (pass && !this.checkID(element, 'data-pass_document_id')) {
            if (element.hasAttribute('data-pass_to')) {
                element.setAttribute('data-pass_document_id', document_id);
                status = true;
                // CoCreateLogic.storePassData(element)

                if (element.parentNode.classList.contains('submitBtn')) {
                    element.click();
                }
            }
        }

        var event = new CustomEvent('set-document_id', { detail: event_data })
        element.dispatchEvent(event);

    },

    __receivedDocumentId: function (data) {
        if (!data['document_id']) {
            return;
        }

        let element = document.querySelector(`[${this.requestAttr}="${data['element']}"]`);
        if (!element) return;
        let self = this;
        const form = (element.tagName === "FORM") ? element : this.__getParents(element, 'form');
        const collection = data['collection'];
        const id = data['document_id']
        if (form && id) {
            form.setAttribute('data-form_id', data['element']);

            const elements = form.querySelectorAll(`[data-collection=${collection}], [data-pass_collection=${collection}]`)

            elements.forEach(function (el) {
                el.removeAttribute(self.requestAttr);
                if (el.hasAttribute('name')) {
                    self.__setNewIdProcess(el, id);
                }

                if (el.hasAttribute('data-pass_to')) {
                    self.__setNewIdProcess(el, id, true);
                }
            })

        } else if (element) {
            this.__setNewIdProcess(element, id);
        }
    },

    __getParents: function (element, selector = "form") {
        if (!Element.prototype.matches) {
            Element.prototype.matches = Element.prototype.matchesSelector || Element.prototype.mozMatchesSelector || Element.prototype.msMatchesSelector || Element.prototype.oMatchesSelector || Element.prototype.webkitMatchesSelector ||

                function (s) {
                    var matches = (this.document || this.ownerDocument).querySelectorAll(s),
                        i = matches.length;
                    while (--i >= 0 && matches.item(i) !== this) { }
                    return i > -1;
                };
        }

        for (; element && element !== document; element = element.parentNode) {
            if (element.matches(selector)) return element;
        }
        return null;
    },

    /** current unused functions **/

    setDocumentIDOfElement: function (element, document_id) {
        let old_document_id = element.getAttribute('data-document_id');
        if (!old_document_id || old_document_id == "" || old_document_id == "pending") {
            element.setAttribute('data-document_id', document_id);
        }
    },

}

CoCreateDocument.init();



const CoCreateForm = {

    init: function () {
        const forms = document.querySelectorAll('form');
        const self = this;

        forms.forEach((form) => {
            self.__initAttribute(form)
        })
    },

    initElement: function (container) {
        const __container = container || document

        if (!__container.querySelectorAll) {
            return;
        }
        let forms = __container.querySelectorAll('form');
        let self = this;

        if (forms.length === 0 && __container != document && __container.tagName === "FORM") {
            forms = [__container];
        }

        forms.forEach((form) => {
            // if (CoCreateInit.getInitialized(form)) {
            // 	return;
            // }
            // CoCreateInit.setInitialized(form);

            self.__initForm(form)
        })
    },

    disableAutoFill: function (element) {
        if (element.tagName == "TEXTAREA") {
            element.value = "";
            element.setAttribute("autocomplete", "off")
        }
        if (!element.hasAttribute("autocomplete")) {
            element.setAttribute('autocomplete', "off");
        }
    },

    __initForm: function (form) {
        const submitBtn = form.querySelector('.submitBtn, .registerBtn');

        this.__initAttribute(form);
        this.disableAutoFill(form);

        if (submitBtn) {
            this.__setSubmitEvent(form, submitBtn)
        }
    },

    __initAttribute: function (form) {
        // if (!form.getAttribute('data-collection')) {
        // 	return;
        // }
        const collection = form.getAttribute('data-collection') || "";
        const dataRealTime = form.getAttribute('data-realtime');
        const document_id = form.getAttribute('data-document_id') || "";
        let elements = form.querySelectorAll('[name], [data-pass_to]')


        elements.forEach(function (el) {
            if (el.parentNode.classList.contains('template')) {
                return;
            }
            if (el.getAttribute('data-realtime') == null && dataRealTime) {

                // if (!['INPUT', 'TEXTAREA'].indexOf(el.tagName)) {
                el.setAttribute('data-realtime', dataRealTime);
                // }
            }
            if (el.getAttribute('name') && !el.hasAttribute('data-collection') && collection) {
                el.setAttribute('data-collection', collection);
            }

            if (el.getAttribute('data-pass_to') && !el.hasAttribute('data-pass_collection') && collection) {
                el.setAttribute('data-pass_collection', collection);
            }

            if (el.getAttribute('name') && !el.getAttribute('data-document_id') && document_id) {
                el.setAttribute('data-document_id', document_id)
            }
        })
    },

    __setSubmitEvent: function (form, submitBtn) {
        let self = this;

        var dataRealTime = form.getAttribute('data-realtime') || "true";

        submitBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation()

            const elements = form.querySelectorAll(g_moduleSelectors.join(","));

            if (!self.__checkFormValidate(form)) {
                alert('Values are not unique');
                return;
            }

            let request_document_id = false;

            for (var i = 0; i < elements.length; i++) {
                let el = elements[i];
                const data_document_id = el.getAttribute('data-document_id');

                if (el.getAttribute('data-save_value') == 'false') {
                    continue;
                }

                if (!data_document_id) {
                    if (el.getAttribute('name')) {
                        request_document_id = true;
                    }
                    continue;
                }

                if (CoCreateInput.isUsageY(el)) {
                    continue;
                }

                if (self.__isTemplateInput(el)) return;

                var new_event = new CustomEvent("clicked-submitBtn", { detail: { type: "submitBtn" } });
                el.dispatchEvent(new_event);

                el.dispatchEvent(new CustomEvent('CoCreateForm-run', {
                    eventType: 'submitBtn',
                    item: el
                }))
            }

            if (request_document_id) {
                CoCreateDocument.requestDocumentIdOfForm(form)
            }
        });

    },

    __checkFormValidate: function (form) {

        if (typeof CoCreateUnique !== 'undefined') {
            return CoCreateUnique.checkValidate(form)
        }
        return true;
    },

    __isTemplateInput: function (input) {
        if (input.classList.contains('template')) return true;

        let node = input.parentNode;
        while (node) {
            if (node.classList && node.classList.contains('template')) {
                return true;
            }
            node = node.parentNode;
        }

        return false;
    },

}

CoCreateForm.init();
CoCreate.registerSocketInit(CoCreateForm.initElement, CoCreateForm);

CoCreateInit.register('CoCreateForm', CoCreateForm, CoCreateForm.initElement);

// -testing1
const CoCreateAction = {
    attribute: 'data-actions',
    actions: {},
    selectedStage: [],
    stageIndex: 0,
    selectedElement: null,

    completedEventName: 'completedEvent',

    init: function (container) {

        const __container = container || document
        if (!__container.querySelectorAll) {
            return;
        }

        let buttons = __container.querySelectorAll("[data-actions]");

        for (let i = 0; i < buttons.length; i++) {
            this.actionButtonEvent(buttons[i]);
        }
    },

    actionButtonEvent: function (btn) {
        const _this = this;
        let checkActions = btn.getAttribute('data-actions') || "";
        checkActions = checkActions.replace(/\s/g, '').split(',');

        if (checkActions.length == 0) {
            return;
        }

        btn.addEventListener('click', function (event) {
            event.preventDefault();
            let actions = this.getAttribute(_this.attribute) || "";
            actions = actions.replace(/\s/g, '').split(',');
            _this.stageIndex = 0;
            _this.selectedStage = actions;

            //. run function
            _this.selectedElement = btn;
            _this.__runActionFunc();

        })
    },

    /**
     * key: string
     * runFunc: function
     * instance: object
     * endEvent: string
     **/
    registerEvent: function (key, runFunc, instance, endEvent) {
        if (this.actions[key]) {
            return;
        }

        this.actions[key] = {
            key: key,
            runFunc: runFunc,
            instance: instance || window,
            endEvent: endEvent
        }
        //. register events

        for (let __key in this.actions) {
            if (__key != key && this.actions[__key]['endEvent'] === endEvent) {
                return;
            }
        }

        //. register events
        const _this = this;
        document.addEventListener(endEvent, function (e) {
            _this.__nextAction(endEvent, e.detail)
        });
    },

    __runActionFunc: function (data) {

        if (this.stageIndex >= this.selectedStage.length) {

            //. if latest case, it will be run aTag
            if (this.stageIndex == this.selectedStage.length) {
                this.__runAtag(this.selectedElement);
            }
            return;
        }

        const key = this.selectedStage[this.stageIndex];
        //. run function
        const action = this.actions[key];
        if (action && action.runFunc) {
            action.runFunc.call(action.instance, this.selectedElement, data);
        }
    },

    __nextAction: function (eventName, data) {
        const key = this.selectedStage[this.stageIndex];
        if (!key) {
            return;
        }
        if (eventName !== this.actions[key].endEvent) {
            return;
        }
        this.stageIndex++;
        this.__runActionFunc(data);
    },

    __runAtag: function (button) {
        var aTag = button.querySelector('a');

        if (aTag) {
            CoCreateLogic.setLinkProcess(aTag)
        }
    }
}

CoCreateAction.init();
var arrayClass = 'arrayField';

initSocketsForArray();
initArrayForms();
//-2-1
function initSocketsForArray() {
    CoCreateSocket.listen('connect', function (data, room) {
        console.log('socket connected');
        if (room == CoCreateSocket.getGlobalScope()) {
            socketConnectedForArray();
        }
    })

    CoCreateSocket.listen('createDocument', function (data) {
        insertCreatedIdToArray(data);
    })

    CoCreateSocket.listen('readDocument', function (data) {
        fetchedDataForArray(data);
    })

    CoCreateSocket.listen('updateDocument', function (data) {
        fetchedDataForArray(data);
    })

    // CoCreateSocket.listen('fetchedModuleActivity', function (data) {
    //   fetchedDataForArray(data, 'module_activity');
    // });

    // CoCreateSocket.listen('fetchedModule', function(data) {
    //   fetchedDataForArray(data, data['data-collection']);
    // })
}

function initArrayForms() {
    var forms = document.querySelectorAll('form');

    for (var i = 0; i < forms.length; i++) {
        var form = forms[i];

        initArrayTags(form);
    }
}

function initArrayTags(form) {
    var arrayTags = form.querySelectorAll('[data-array_name]');

    for (var i = 0; i < arrayTags.length; i++) {
        var arrayTag = arrayTags[i];

        initArrayTag(form, arrayTag);
    }
}

function initArrayTag(form, arrayTag) {
    var real_time = form.getAttribute('data-realtime');
    var collection = form.getAttribute('data-collection') ? form.getAttribute('data-collection') : 'module_activity';


    if (real_time != 'false') {

        arrayTag.addEventListener('change', function (e) {
            e.preventDefault();
            var array_name = this.getAttribute('data-array_name');

            var value = getArrayValue(form, arrayTag);

            var id = collection == this.getAttribute('data-document_id');
            if (id) {
                CoCreate.updateDocument({
                    'collection': collection,
                    'document_id': id,
                    'data': { [array_name]: value },
                    'metadata': ""
                });
            }
        })

        if (arrayTag.tagName != 'SELECT') {
            var checkboxs = arrayTag.querySelectorAll('input[type="checkbox"]');

            for (var i = 0; i < checkboxs.length; i++) {
                var checkbox = checkboxs[i];

                checkbox.addEventListener('change', function (e) {
                    e.preventDefault();
                    //arrayTag.dispatchEvent(new Event('change'));
                })
            }
        }
    }
}

function socketConnectedForArray() {
    fetchArrays();
}



function insertCreatedIdToArray(data) {
    var form_id = data['element'];

    var form = document.querySelector("form[data-form_id='" + form_id + "']");

    if (form) {

        var arrayTags = form.getElementsByClassName('arrayField');
        var collection = form.getAttribute('data-collection');

        collection = collection ? collection : 'module_activity';

        for (var i = 0; i < arrayTags.length; i++) {
            var arrayTag = arrayTags[i];
            var data_module_id = arrayTag.getAttribute('data-document_id');
            if (!data_module_id) {
                arrayTag.setAttribute('data-document_id', data['document_id']);
            }
        }
    }
}

function getArrayValue(form, arrayTag) {


    var arrayValue = [];


    if (arrayTag.tagName == 'SELECT') {
        var value = arrayTag.value;
        arrayValue.push(value);
    } else {

        var checkboxs = arrayTag.querySelectorAll('input[type="checkbox"]');
        for (var i = 0; i < checkboxs.length; i++) {
            var checkbox = checkboxs[i];
            if (checkbox.checked) {
                var value = checkbox.value;
                arrayValue.push(value);
            }
        }


    }


    console.log(arrayValue);
    return arrayValue;
}

function updateArray(form) {
    var collection = form.getAttribute('data-collection') || 'module_activity';
    var arrayTags = form.querySelectorAll('[data-array_name]');

    for (var i = 0; i < arrayTags.length; i++) {

        var arrayTag = arrayTags[i];

        var array_name = arrayTag.getAttribute('data-array_name');
        var value = getArrayValue(form, arrayTag);

        var id = arrayTag.getAttribute('data-document_id');

        if (id) {
            CoCreate.updateDocument({
                'collection': collection,
                'document_id': id,
                'data': { [array_name]: value },
                'metadata': ""
            });
        }
    }
}

function fetchedDataForArray(data) {
    var collection = data['collection'];

    var forms = document.querySelectorAll('form');

    for (var f = 0; f < forms.length; f++) {
        var form = forms[f];
        var form_collection = form.getAttribute('data-collection') ? form.getAttribute('data-collection') : 'module_activity';

        if (form_collection != collection) continue;

        var arrayTags = form.querySelectorAll('[data-array_name]');

        for (var i = 0; i < arrayTags.length; i++) {
            var arrayTag = arrayTags[i];

            var module_id = arrayTag.getAttribute('data-document_id');

            if (module_id === data['document_id']) {
                updateArrayData(arrayTag, data['data']);
            }
        }
    }
}

function updateArrayData(arrayTag, data) {

    var array_name = arrayTag.getAttribute('data-array_name');

    if (array_name in data) {
        var value = data[array_name];

        if (arrayTag.tagName == 'SELECT') {
            if (value.length > 0) {
                arrayTag.value = value[0];
            } else {
                arrayTag.value = null;
            }
        } else {
            var checkboxs = arrayTag.querySelectorAll('input[type="checkbox"]');

            for (var i = 0; i < checkboxs.length; i++) {
                var checkbox = checkboxs[i];
                if (value.indexOf(checkbox.value) > -1) {
                    checkbox.checked = true;
                } else {
                    checkbox.checked = false;
                }
            }
        }
    }
}

function fetchArrays() {
    var fetchArray = [];

    var forms = document.querySelectorAll('form');
    for (var f = 0; f < forms.length; f++) {

        var form = forms[f];
        var data_collection = form.getAttribute('data-collection') ? form.getAttribute('data-collection') : 'module_activity';

        var arrayTags = form.querySelectorAll('[data-array_name]');

        for (var i = 0; i < arrayTags.length; i++) {
            var arrayTag = arrayTags[i];

            var data_module_id = arrayTag.getAttribute('data-document_id');

            if (data_module_id) {
                var exist = false;

                for (var j = 0; j < fetchArray.length; j++) {
                    if (data_collection == fetchArray[j]['data-collection'] && data_module_id == fetchArray[j]['id']) {
                        exist = true; continue;
                    }
                }

                if (!exist) {
                    fetchArray.push({
                        'data-collection': data_collection,
                        'id': data_module_id
                    })
                }
            }
        }
    }

    fetchArray.forEach((item) => {
        CoCreate.readDocument({
            collection: item['data-collection'],
            document_id: item['id'],
            metadata: ''
        })
    })
}

const CoCreateFilter = {
    items: [],
    ioInstance: null,
    moduleAttribues: [],

    /** start init processing **/
    init: function () {
        this.__initIntesection()
        this.__initSocket()
        this.__initEvents()
    },

    __initIntesection: function () {
        const self = this;
        this.ioInstance = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const attributeInfo = self.__getMainAttribue(entry.target);
                    if (attributeInfo.id) {
                        document.dispatchEvent(new CustomEvent('CoCreateFilter-loadMore', {
                            detail: {
                                attrName: attributeInfo.name,
                                attrId: attributeInfo.id
                            }
                        }));
                    }
                    self.ioInstance.unobserve(entry.target)
                }
            })
        }, {
            threshold: 1
        })
    },

    __runLoadMore: function (attrName, id) {
        if (!id || !attrName) return;
        let item = this.items.find((item) => item.attrName === attrName && item.id === id)
        if (!item) return;

        if (item.count > 0) {
            this.fetchData(item)
        }
    },

    __getMainAttribue: function (el) {
        const attribute = this.moduleAttribues.find((attr) => (el.getAttribute(attr) || "") !== "")
        if (attribute) {
            return {
                name: attribute,
                id: el.getAttribute(attribute)
            }
        } else {
            return {};
        }
    },

    __initSocket: function () {
        const self = this;
        CoCreate.listenMessage('readDocumentList', function (data) {
            let item_id = data['element'];
            let item = self.items.find((item) => item.id === item_id);
            if (item) {
                // eObj.startIndex += data.result.length;
                const result_data = data['data'];

                //. set the intersection observe element
                let element = document.querySelector(`[${item.attrName}="${item.id}"][data-fetch_type="scroll"]`)
                if (result_data.length > 0 && element) {
                    self.ioInstance.observe(element)
                }

                // /** render total count **/
                const totalCount = data['operator'].total
                const totalElements = document.querySelectorAll(`[${item.attrName}="${item.id}"][data-fetch_type="total"]`)

                if (totalElements) {
                    totalElements.forEach((el) => el.innerHTML = totalCount)
                }
            }
        })
    },

    __initEvents: function () {
        const self = this;
        document.addEventListener('CoCreateFilter-loadMore', function (event) {
            const attrId = event.detail.attrId;
            const attrName = event.detail.attrName
            self.__runLoadMore(attrName, attrId)
        })

        let buttons = document.querySelectorAll('[data-fetch_type="loadmore"]');
        buttons.forEach((btn) => {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                const attributeInfo = self.__getMainAttribue(btn);

                if (!attributeInfo.id) return;
                self.__runLoadMore(attributeInfo.attrName, attributeInfo.attrId)
            })
        });
    },

    /** ---  End --- **/

    setFilter: function (el, mainAttr, type) {

        if (!mainAttr) {
            return;
        }

        let id = el.getAttribute(mainAttr);

        if (!id) return;

        if (!this.moduleAttribues.includes(mainAttr)) this.moduleAttribues.push(mainAttr)

        let collection = el.getAttribute('data-fetch_collection') || 'module_activity';
        let fetch_type = el.getAttribute('data-fetch_value_type')
        let fetch_collection = fetch_type == "collection" ? true : false;

        let order_name = el.getAttribute('data-order_by')
        let order_type = el.getAttribute('data-order_type') || 'asc';

        let fetch_count = parseInt(el.getAttribute('data-fetch_count'));

        let item = {
            el: el,
            id: id,
            eId: id, // + this.items.length,
            type: type,

            attrName: mainAttr,

            collection: collection,
            startIndex: 0,
            options: {},	/** return options **/
            fetch: {},
            is_collection: fetch_collection,
            search: {
                type: 'or',
                value: []
            },
            orders: [],
            filters: []
        }

        if (!isNaN(fetch_count) && fetch_count > 0) {
            item.count = fetch_count;
        }

        if (order_name) {
            item.orders.push({ name: order_name, type: order_type == 'asc' ? 1 : -1 })
        }

        this._initFilter(item, id, mainAttr);
        this._initOrder(item, id, mainAttr);
        this.items.push(item);
        this._initInputForm(item, mainAttr);

        this._initExportImport(item, id, mainAttr);
        return item;
    },

    _initFilter: function (item, id, attrName) {
        let filter_objs = item.el.getRootNode().querySelectorAll('[' + attrName + '="' + id + '"]');
        for (var i = 0; i < filter_objs.length; i++) {

            let f_el = filter_objs[i];
            let filter_name = f_el.getAttribute('data-filter_name');
            let filter_operator = f_el.getAttribute('data-filter_operator') ? f_el.getAttribute('data-filter_operator') : 'contain';
            let value_type = f_el.getAttribute('data-filter_value_type') ? f_el.getAttribute('data-filter_value_type') : 'string';
            let filter_type = f_el.getAttribute('data-filter_type');
            let filter_value = f_el.getAttribute('data-filter_value');
            if (!filter_value || filter_value == "") {
                continue;
            }
            if (value_type !== "raw") {
                filter_value = filter_value.replace(/\s/g, '').split(',');
            }

            if (!filter_name) {
                item.search.value = this._makeSearchOption(id, attrName);
            } else {
                let idx = this.getFilterByName(item, filter_name, filter_operator);
                if (value_type != 'string') {
                    for (let i = 0; i < filter_value.length; i++) {
                        filter_value[i] = Number(filter_value[i]);
                    }
                }
                this.insertArrayObject(item.filters, idx, { name: filter_name, value: filter_value, operator: filter_operator, type: filter_type })
            }
        }
    },

    _initOrder: function (item, id, attrName) {
        let filter_objs = item.el.getRootNode().querySelectorAll('[' + attrName + '="' + id + '"]');
        const _this = this;
        for (var i = 0; i < filter_objs.length; i++) {

            let f_el = filter_objs[i];
            let order_name = f_el.getAttribute('data-order_by');
            let order_value = f_el.getAttribute('value');
            if (!order_name || !order_value) {
                continue;
            }

            if (['A', 'BUTTON'].includes(f_el.tagName)) {
                f_el.addEventListener('click', function () {
                    let name = this.getAttribute('data-order_by');
                    let value = this.getAttribute('value');
                    _this._applyOrder(item, name, value)
                    if (item.el) {
                        item.el.dispatchEvent(new CustomEvent("changeFilterInput", { detail: { type: 'order' } }))
                    }
                });
                //. apply click event
            } else {
                this._applyOrder(item, order_name, order_value);
            }
        }

        this._initToggleOrderEvent(item, id, attrName);
    },

    _initToggleOrderEvent: function (item, id, attrName) {
        let elements = document.querySelectorAll(`[${attrName}="${id}"][data-toggle_order]`)
        const self = this;
        elements.forEach((element) => {
            element.addEventListener('click', function () {
                let value = this.getAttribute('data-toggle_order') || '';
                let order_name = this.getAttribute('data-order_by');

                value = value === 'asc' ? 'desc' : 'asc';

                for (let i = 0; i < elements.length; i++) {
                    if (elements[i] !== element) {
                        elements[i].setAttribute('data-toggle_order', '');
                    }
                }

                item.orders = [];

                self._applyOrder(item, order_name, value);
                element.setAttribute('data-toggle_order', value);

                if (item.el) {
                    item.el.dispatchEvent(new CustomEvent("changeFilterInput", { detail: { type: 'order' } }))
                }

            })
        })
    },

    _initExportImport: function (item, id, attrName) {
        let export_button = document.querySelector(`[data-export_type][${attrName}="${id}"]`);
        let import_button = document.querySelector(`[data-import="true"][${attrName}="${id}"]`);

        const self = this;
        if (export_button) {
            //. export_buttons action
            export_button.addEventListener('click', function () {

                if (!item) return;

                let new_filter = self.makeFetchOptions(item)

                new_filter.export = {
                    collection: new_filter.collection,
                    type: export_button.getAttribute('data-export_type') || 'json'
                }
                CoCreate.readDocumentList(new_filter);
            })

        }

        if (import_button) {
            //. import button action
            import_button.addEventListener('click', function () {
                var input = document.createElement('input');
                input.type = 'file';

                if (!item) return;

                let collection = item.collection;

                //. or 
                // collection = btn.getAttribute('data-collection');

                input.onchange = e => {
                    var file = e.target.files[0];
                    CoCreate.importCollection({
                        collection: collection,
                        file: file
                    })
                }
                input.click();
            })
        }

    },

    _applyOrder: function (item, name, value) {

        if (!value) {
            return;
        }
        let order_type = 0;
        let idx = this.getOrderByName(item, name);

        if (value == 'asc') {
            order_type = 1;
        } else if (value == 'desc') {
            order_type = -1;
        } else {
            order_type = [];
        }
        this.insertArrayObject(item.orders, idx, { name: name, type: order_type }, order_type)
    },

    changeCollection: function (filter) {
        let collection = filter.el.getAttribute('data-fetch_collection') ? filter.el.getAttribute('data-fetch_collection') : 'module_activity';
        filter.collection = collection;
        filter.startIndex = 0;
    },

    _makeSearchOption: function (id, attrName) {
        let forms = document.querySelectorAll('form[' + attrName + '=' + id + ']');

        let tmpSelector = '[' + attrName + '=' + id + ']';
        let otherInputs = document.querySelectorAll('input' + tmpSelector + ',textarea' + tmpSelector + ', select' + tmpSelector);

        let template_inputs = [];

        for (let i = 0; i < forms.length; i++) {
            let form = forms[i];
            let formInputs = form.querySelectorAll('input, textarea, select');
            formInputs = Array.prototype.slice.call(formInputs)
            template_inputs = template_inputs.concat(formInputs);
        }

        otherInputs = Array.prototype.slice.call(otherInputs);
        template_inputs = template_inputs.concat(otherInputs)

        let values = [];

        for (var i = 0; i < template_inputs.length; i++) {
            let filter_name = template_inputs[i].getAttribute('data-filter_name')
            let order_name = template_inputs[i].getAttribute('data-order_by')

            let input = template_inputs[i];
            let value_type = input.getAttribute('data-value_type') ? input.getAttribute('data-value_type') : 'string';
            let value = null;

            if (!filter_name && !order_name) {
                if (input.type == 'checkbox' && !input.checked) {
                    value = null;
                } else {
                    value = input.value;
                    if (value_type != 'string') {
                        value = Number(value);
                    }
                    if (value && !values.includes(value)) {
                        values.push(value)
                    }
                }
            }
        }
        return values;
    },

    _initInputForm: function (item, attrName) {

        if (!item) return;

        let tmpSelector = '[' + attrName + '="' + item.id + '"]';
        let formInputs = item.el.getRootNode().querySelectorAll('form' + tmpSelector + ' input, form' + tmpSelector + ' textarea, form' + tmpSelector + ' select');
        let otherInputs = item.el.getRootNode().querySelectorAll('input' + tmpSelector + ',textarea' + tmpSelector + ', select' + tmpSelector);

        this.setCheckboxName(item.id, attrName);

        formInputs = Array.prototype.slice.call(formInputs);
        otherInputs = Array.prototype.slice.call(otherInputs);
        formInputs = formInputs.concat(otherInputs);

        console.log('input form', tmpSelector);

        for (let i = 0; i < formInputs.length; i++) {
            let input = formInputs[i];

            let order_by = input.getAttribute('data-order_by');

            if (order_by) {
                this._initOrderInput(item, input);
            } else {
                this._initFilterInput(item, input, item.id);
            }
        }
    },

    _initOrderInput: function (item, input) {
        var _instance = this;
        input.addEventListener('change', function (e) {

            e.preventDefault();

            let order_by = this.getAttribute('data-order_by');
            let order_type = 0;
            let idx = _instance.getOrderByName(item, order_by);

            if (this.value == 'asc') {
                order_type = 1;
            } else if (this.value == 'desc') {
                order_type = -1;
            } else {
                order_type = [];
            }

            _instance.insertArrayObject(item.orders, idx, { name: order_by, type: order_type }, order_type)

            if (item.el) {
                item.el.dispatchEvent(new CustomEvent("changeFilterInput", { detail: { type: 'order' } }))
            }
        })
    },

    _initFilterInput: function (item, input, id) {
        var _instance = this;
        var delayTimer;
        input.addEventListener('input', function (e) {
            e.preventDefault();
            let filter_name = this.getAttribute('data-filter_name');
            let filter_operator = this.getAttribute('data-filter_operator') || 'contain';
            let filter_type = this.getAttribute('data-filter_type');
            let value_type = this.getAttribute('data-filter_value_type') || 'string';
            clearTimeout(delayTimer);
            delayTimer = setTimeout(function () {

                if (!filter_name) {
                    item.search.value = _instance._makeSearchOption(id, item.attrName);
                } else {

                    let idx = _instance.getFilterByName(item, filter_name, filter_operator);

                    let inputType = input.type;
                    let filterValue = [];

                    if (inputType == 'checkbox') {
                        var inputGroup = document.querySelectorAll("input[name=" + input.name + "]:checked");
                        for (var i = 0; i < inputGroup.length; i++) {
                            filterValue.push(inputGroup[i].value);
                        }

                    } else if (inputType == 'raido') {

                    } else if (inputType == 'range') {
                        filterValue = [Number(input.min), Number(input.value)];
                    } else {
                        var value = input.value;
                        if (value_type != 'string') {
                            value = Number(value);
                        }
                        if (value != "none") {
                            filterValue = [value];
                        }

                        if (value_type === "raw") {
                            filterValue = value;
                        }
                    }

                    _instance.insertArrayObject(item.filters, idx, { name: filter_name, value: filterValue, operator: filter_operator, type: filter_type })
                }
                if (item.el) {
                    item.el.dispatchEvent(new CustomEvent("changeFilterInput", { detail: { type: 'filter' } }))
                }

            }, 500);

        })
    },
    setCheckboxName: function (id, attrName) {
        var forms = document.querySelectorAll('form[' + attrName + '="' + id + '"]')
        for (var k = 0; k < forms.length; k++) {

            var elements = forms[k].querySelectorAll('input[type=checkbox], form input[type=radio]');

            for (var i = 0; i < elements.length; i++) {
                var el_name = elements[i].getAttribute('name');
                var f_name = elements[i].getAttribute('data-filter_name');
                if (el_name || !f_name) {
                    continue;
                }
                elements[i].setAttribute('name', "_" + id + "-" + f_name + "_" + k);
            }

        }
    },

    getFilterByName: function (item, filterName, filterOperator) {
        for (var i = 0; i < item.filters.length; i++) {
            var f = item.filters[i];
            if (f.name == filterName && f.operator == filterOperator) {
                return i;
            }
        }
        return -1;
    },

    insertArrayObject: function (data, idx, obj, value) {
        if (!value) {
            value = obj.value;
        }
        if (typeof value == 'object' && value.length == 0) {
            if (idx != -1) {
                data.splice(idx, 1);
            }
        } else {
            if (idx != -1) {
                data[idx] = obj;
            } else {
                data.push(obj);
            }
        }

        return data;
    },

    getOrderByName: function (item, name) {
        for (var i = 0; i < item.orders.length; i++) {
            if (item.orders[i].name == name) {
                return i;
            }
        }
        return -1;
    },


    defineEvent: function (item) {
        item.el.addEventListener('fetchFilterData', function (event) {
            console.log(event);
        });
    },

    fetchData: function (item) {
        let json = this.makeFetchOptions(item);
        CoCreate.readDocumentList(json);
    },

    getObjectByFilterId: function (obj, id) {
        for (var i = 0; i < obj.length; i++) {
            let filter = obj[i].filter;
            if (!filter) {
                continue;
            }

            if (filter.id == id) {
                return obj[i];
            }
        }
    },

    getObjectByElement: function (obj, el) {
        for (var i = 0; i < obj.length; i++) {
            let filter = obj[i].filter;
            if (!filter) {
                continue;
            }

            if (filter.el.isSameNode(el)) {
                return obj[i];
            }
        }
    },

    makeFetchOptions: function (item) {
        let json = {
            "collection": item.collection,
            "element": item.eId,
            "metadata": "",
            "operator": {
                "filters": item.filters,
                "orders": item.orders,
                "search": item.search,
                "startIndex": item.startIndex,
            },
            "is_collection": item.is_collection
        }

        if (item.count) {
            json['operator'].count = item.count;
        }
        return json;
    }
}

CoCreateFilter.init();


/**
 * change name Class
 * add functionality to add value on any attr of each elements into template
 */
const CoCreateRender = {

    __getValueFromObject: function (json, path) {
        try {
            if (typeof json == 'undefined' || !path)
                return false;
            let jsonData = json, subpath = path.split('.');

            for (let i = 0; i < subpath.length; i++) {
                jsonData = jsonData[subpath[i]];
                if (!jsonData) return false;
            }
            return jsonData;
        } catch (error) {
            console.log("Error in getValueFromObject", error);
            return false;
        }
    },

    __getValue: function (data, attrValue) {
        let result = /{{\s*([\w\W]+)\s*}}/g.exec(attrValue);
        if (result) {
            return this.__getValueFromObject(data, result[1].trim());
        }
        return false;

    },

    __createObject: function (data, path) {
        try {
            if (!path) return data;

            let keys = path.split('.')
            let newObject = data;

            for (var i = keys.length - 1; i >= 0; i--) {
                newObject = { [keys[i]]: newObject }
            }
            return newObject;

        } catch (error) {
            console.log("Error in getValueFromObject", error);
            return false;
        }
    },

    setArray: function (template, data) {
        const type = template.getAttribute('data-render_array') || "data";
        const render_key = template.getAttribute('data-render_key') || type;
        const self = this;
        const arrayData = this.__getValueFromObject(data, type);
        if (type && Array.isArray(arrayData)) {
            arrayData.forEach((item, index) => {

                let cloneEl = template.cloneNode(true);
                cloneEl.classList.remove('template');
                cloneEl.classList.add('clone_' + type);
                if (typeof item !== 'object') {
                    item = { "--": item };
                } else {
                    item['index'] = index;
                }
                let r_data = self.__createObject(item, render_key);

                self.setValue([cloneEl], r_data);
                template.insertAdjacentHTML('beforebegin', cloneEl.outerHTML);
            })
        }
    },

    setValue: function (els, data, passTo, template) {
        if (!data) return;
        const that = this;
        Array.from(els).forEach(e => {
            let passId = e.getAttribute('data-pass_id');
            if (passTo && passId != passTo) {
                return;
            }
            Array.from(e.attributes).forEach(attr => {
                let attr_name = attr.name.toLowerCase();
                let isPass = false;
                let attrValue = attr.value;
                let variables = attrValue.match(/{{\s*(\S+)\s*}}/g);
                if (!variables) {
                    return;
                }

                variables.forEach((attr) => {
                    let value = that.__getValue(data, attr)
                    if (value && typeof (value) !== "object") {
                        isPass = true;
                        attrValue = attrValue.replace(attr, value);
                    }
                })
                if (isPass) {
                    if (attr_name == 'value') {
                        let tag = e.tagName.toLowerCase();
                        switch (tag) {
                            case 'input':
                                e.setAttribute(attr_name, attrValue);
                                break;
                            case 'textarea':
                                e.setAttribute(attr_name, attrValue);
                                e.textContent = attrValue;
                                break;
                            default:
                                if (e.children.length === 0) {
                                    e.innerHTML = attrValue;
                                }
                        }
                    }
                    e.setAttribute(attr_name, attrValue);
                }
            });

            if (e.children.length > 0) {
                that.setValue(e.children, data)

                if (e.classList.contains('template')) {
                    that.setArray(e, data);
                }
            }
        });
    },

    render: function (selector, dataResult) {
        let template_div = document.querySelector(selector)
        if (!template_div) {
            return;
        }
        if (Array.isArray(dataResult)) {
            template_div.setAttribute('data-render_array', 'test');
            this.setValue([template_div], { test: dataResult });
        } else {
            this.setValue(template_div.children, dataResult);
        }
    }

}

const CoCreateFetch = {
    selector: '[data-template_id][data-fetch_collection]',
    items: [],

    init: function () {
        this.initElement();
        this.__initSocketEvent();
        this.__initEvents()
    },

    initElement: function (container) {

        let mainContainer = container || document;
        const self = this;
        if (!mainContainer.querySelectorAll) {
            return;
        }
        let wrappers = mainContainer.querySelectorAll(this.selector);
        if (wrappers.length == 0 && mainContainer != document && mainContainer.hasAttributes('date-template_id') && mainContainer.hasAttributes('date-fetch_collection')) {
            wrappers = [mainContainer];
        }
        wrappers.forEach((wrapper) => self.__initEachElement(wrapper, true, true))
    },

    //. public functions....
    reload: function (element) {
        if (!element || !element.getAttribute) {
            return;
        }
        this.__initEachElement(element, true)
    },

    __initSocketEvent: function () {
        const self = this;
        CoCreateSocket.listen('readDocumentList', function (data) {
            self.__fetchedItem(data)
        })
        CoCreateSocket.listen('readCollectionList', function (data) {
            self.__fetchedItem(data)
        })

        CoCreateSocket.listen('createDocument', function (data) {
            self.__createItem(data)
        })

        CoCreateSocket.listen('deleteDocument', function (data) {
            self.__deleteItem(data);
        })
    },

    __initEvents: function () {
        const self = this;
        document.addEventListener('dndsuccess', function (e) {
            const { dropedEl, dragedEl } = e.detail;
            let dragElTemplate = self.findTemplateElByChild(dragedEl);
            let dropElTemplate = self.findTemplateElByChild(dropedEl);

            if (!dragElTemplate || !dropElTemplate) {
                return;
            }

            if (!dragElTemplate.isSameNode(dropElTemplate)) {
                //. save template id
                self.updateParentTemplateOfChild(dragElTemplate, dragedEl)

                //. reordering
                self.reorderChildrenOfTemplate(dragElTemplate);
                self.reorderChildrenOfTemplate(dropElTemplate);
            } else {
                self.reorderChildrenOfTemplate(dropElTemplate);
            }
        })
    },

    __initEachElement: function (element, isInit, checkInit) {
        let item_id = element.getAttribute('data-template_id');
        if (!item_id) return;

        let item = CoCreateFilter.getObjectByFilterId(this.items, item_id);
        let filter = null;
        const self = this;

        if (checkInit && CoCreateInit.getInitialized(element)) {
            return;
        }

        if (!item) {
            filter = CoCreateFilter.setFilter(element, "data-template_id", "template");
            let fetch_type = element.getAttribute('data-fetch_value_type') || "string";
            if (!filter) return;

            // if (checkInit) {  
            CoCreateInit.setInitialized(element)
            // }

            if (fetch_type === 'collection') {
                filter.is_collection = true;
            }

            item = {
                el: element,
                filter: filter,
                templateId: item_id,
                fetch_type: fetch_type
            }

            this.items.push(item);

            element.addEventListener("changeFilterInput", function (e) {
                self.__removeOldData(item.el)
                item.filter.startIndex = 0;
                CoCreateFilter.fetchData(item.filter);
            })

        } else {
            filter = item.filter
            CoCreateFilter.changeCollection(filter);
            if (isInit) {
                self.__removeOldData(element);
                filter.startIndex = 0;
            }
        }
        CoCreateFilter.fetchData(filter);
    },

    __runLoadMore: function (templateId) {
        if (!templateId) return;
        let item = CoCreateFilter.getObjectByFilterId(this.items, templateId);

        if (!item) return;
        if (item.filter.count > 0) {
            CoCreateFilter.fetchData(item.filter)
        }
    },

    __removeOldData: function (wrapper) {
        let item_id = wrapper.getAttribute('data-template_id');
        let elements = wrapper.querySelectorAll("[templateId='" + item_id + "']");
        elements.forEach((el) => el.remove())
    },

    __cloneElement: function (clone_node, templateId, type) {
        let itemTemplateDiv = document.createElement(clone_node.parentNode.tagName || 'div');
        // let itemTemplateDiv = document.createElement('tbody');
        let template = clone_node.cloneNode(true);
        template.setAttribute('templateId', templateId);
        template.removeAttribute('id');

        if (!type) type = "data"
        if (!template.getAttribute('data-render_array')) {
            template.setAttribute('data-render_array', type);
        }

        itemTemplateDiv.appendChild(template.cloneNode(true));
        return itemTemplateDiv;
    },

    __renderData: function (wrapper, data, type = "data") {

        let template = wrapper.querySelector('.template');
        if (!template) return;
        let renderId = wrapper.getAttribute('data-render_id');
        let templateId = wrapper.getAttribute('data-template_id');
        let passTo = wrapper.getAttribute('data-pass_to');
        let renderData = renderId ? { [renderId]: data } : data;

        type = type || "data";
        type = renderId ? `${renderId}.${type}` : type;

        let cloneWrapper = this.__cloneElement(template, templateId, type);

        CoCreateRender.setValue(cloneWrapper.children, renderData, passTo, cloneWrapper);

        cloneWrapper.querySelector(`.template[data-template_id="${templateId}"]`).remove();

        template.insertAdjacentHTML('beforebegin', cloneWrapper.innerHTML);

        var evt = new CustomEvent('fetchedTemplate', { bubbles: true });
        wrapper.dispatchEvent(evt);
        this.__initNewAtags(wrapper.parentNode);

        /// init passValueBtns
        let forms = wrapper.parentNode.getElementsByTagName('form');

        for (let i = 0; i < forms.length; i++) {
            let form = forms[i];
            let valuePassBtn = form.querySelector('.passValueBtn');
            if (valuePassBtn) CoCreateLogic.__registerValuePassBtnEvent(form, valuePassBtn);
        }

        this.initElement(wrapper)
    },

    __initNewAtags: function (parent) {
        let aTags = parent.querySelectorAll('a');
        aTags.forEach(aTag => {
            if (aTag.classList.contains('newLink')) {
                aTag.addEventListener('click', function (e) {
                    e.preventDefault();
                    CoCreateLogic.setLinkProcess(this);
                })
            }
        })
    },

    __deleteItem: function (data) {
        let collection = data['collection'];
        let document_id = data['document_id'];

        for (let i = 0; i < this.items.length; i++) {
            let item = this.items[i];

            if (item.filter.collection == collection) {
                var tmpId = item.el.getAttribute('data-template_id')
                var els = item.el.querySelectorAll("[templateId='" + tmpId + "'][data-document_id='" + document_id + "']");
                for (let j = 0; j < els.length; j++) {
                    els[j].remove();
                    item.startIndex--;
                }
            }
        }
    },

    __fetchedItem: function (data) {
        let item_id = data['element'];
        let item = CoCreateFilter.getObjectByFilterId(this.items, item_id);

        if (item) {
            item.filter.startIndex += data['data'].length;
            let fetch_name = item.el.getAttribute('data-fetch_name');
            if (fetch_name) {
                data = data.data[0];
            }
            this.__renderData(item.el, data, fetch_name);
        }
    },

    __createItem: function (data) {
        let collection = data['collection'];
        this.items.forEach((item) => {
            const { filter } = item;
            let ids = [];
            item.fetch_ids = [];
            if (filter.collection === collection && filter.fetch.value && filter.fetch.value === data['data'][filter.fetch.name]) {
                ids.push(data['document_id']);
            }

            if (ids.length > 0) {
                let info = CoCreateFilter.makeFetchOptions(item.item);
                info['created_ids'] = ids;
                CoCreate.readDocumentList(info);
            }
        })
    },

    findTemplateElByChild: function (element) {
        return CoCreateUtils.getParentFromElement(element, null, ['data-template_id', 'data-fetch_collection']);
    },

    updateParentTemplateOfChild: function (template, element) {
        const name = template.getAttribute('data-fetch_name')
        if (!name) return;
        CoCreate.replaceDataCrdt({
            collection: template.getAttribute('data-fetch_collection'),
            document_id: element.getAttribute('data-document_id'),
            name,
            value: template.getAttribute('data-fetch_value'),
            broadcast: false,
            update_crud: true
        })
    },

    reorderChildrenOfTemplate: function (template) {
        const orderField = template.getAttribute('data-order_by')
        const template_id = template.getAttribute('data-template_id')
        if (!orderField || !template_id) {
            return;
        }
        const children = template.querySelectorAll(`[data-template_id="${template_id}"][data-document_id]:not(.template)`)

        const coff = template.getAttribute('data-order_type') !== 'asc' ? -1 : 1;
        children.forEach((item, index) => {
            if (item.classList.contains('template')) {
                return
            }
            CoCreate.replaceDataCrdt({
                collection: template.getAttribute('data-fetch_collection'),
                document_id: item.getAttribute('data-document_id'),
                name: orderField,
                value: index * coff,
                broadcast: false,
                update_crud: true
            })
        })
    }
}

CoCreateFetch.init();
// CoCreateInit.register('CoCreateTemplate', CoCreateTemplate, CoCreateTemplate.initElement);


const CoCreateHtmlTags = {

    selector: "h1, h2, h3, h4, h5, h6, p, i, q, a, b, li, span, code, head, div.domEditor, iframe, body, img, html",

    init: function () {
        this.__initAttribute()
        this.__initSocket()
        this.__initEvents()
    },

    initElement: function (element) {
        if (!element || !element.getAttribute) {
            return;
        }

        const requests = this.__getReqeust(element)
        if (requests) {

            requests.forEach((req) => {
                CoCreate.readDocument({
                    collection: req['collection'],
                    document_id: req['document_id']
                })
            })
        }
    },

    save: function (el, broadcast, broadcast_sender) {

        if (typeof el == "object") {
            const event = new CustomEvent('changed-element', {});
            el.dispatchEvent(event);
        }

        if (!el.classList.contains('domEditor')) {
            return;
        }

        // if (CoCreateUtils.isRealTime(el) || isSubmit) {
        const collection = el.getAttribute('data-collection')
        const document_id = el.getAttribute('data-document_id');
        const name = el.getAttribute('name')
        let el_broadcast = el.getAttribute('data-broadcast') || "true";
        let namespace = el.getAttribute('data-namespace') || '';
        let room = el.getAttribute('data-room') || ''

        el_broadcast = (el_broadcast === "true") ? true : false;
        if (!broadcast) {
            broadcast = el_broadcast;
        }

        let save_value = '';

        if (el.tagName === 'IFRAME') {
            save_value = el.srcdoc;
        } else {
            save_value = el.innerHTML;
        }

        if (broadcast) {
            CoCreate.replaceDataCrdt({
                collection, document_id, name,
                value: save_value,
                namespace,
                room,
                broadcast,
                update_crud: true,
                upsert: true,
                broadcast_sender
            })
        } else {
            CoCreate.updateDocument({
                namespace,
                room,
                collection,
                document_id,
                upsert: true,
                broadcast_sender,
                data: {
                    [name]: save_value
                },
                broadcast: false
            })
        }
        // }
    },

    render: function (data) {

        // const tags_selector = this.__addAttributeSelectorTags('h1, h2, h3, h4, h5, h6, p, i, q, a, b, li, span, code, head, div.domEditor, body, img, html')
        const tags_selector = this.__addAttributeSelectorTags(this.selector)
        let elements = document.querySelectorAll(tags_selector)

        let isRendered = false;
        const self = this;

        elements.forEach((el) => {
            const collection = el.getAttribute('data-collection')
            const id = el.getAttribute('data-document_id')
            const name = el.getAttribute('name')
            const readValue = CoCreateUtils.isReadValue(el);

            if (!readValue) {
                return;
            }

            if (data['collection'] == collection && data['document_id'] == id && (name.split(".")[0] in data.data) && !el.isContentEditable) {
                const value = self.__getValueFromJonDeep(data.data, name)
                if (value === null) return;

                if (el.tagName === 'IMG') {
                    el.src = value;
                } else if (el.tagName === 'IFRAME') {
                    el.srcdoc = value;
                } else {
                    el.innerHTML = value;
                }

                if (el.tagName == 'HEAD' || el.tagName == 'BODY') {
                    el.removeAttribute('data-collection');
                    el.removeAttribute('data-document_id');
                    el.removeAttribute('data-pass_id');

                    var scripts = el.querySelectorAll('script');
                    for (var k = 0; k < scripts.length; k++) {
                        var tmp = document.createElement('script');
                        tmp.type = "text/javascript";

                        var src = scripts[k].getAttribute('src');
                        var innerHtml = scripts[k].innerHTML;

                        if (innerHtml != "") tmp.innerHTML = innerHtml;
                        if (src) tmp.src = src;


                        el.appendChild(tmp);

                        scripts[k].remove();
                    }
                }
                isRendered = true
            }
        })

        if (isRendered) {
            //. rendered event
            const event = new CustomEvent('CoCreateHtmlTags-run', {
                eventType: 'rendered',
                detail: {
                    data: data
                }
            })

            document.dispatchEvent(event)
        }
    },

    __getReqeust: function (container) {

        let fetch_container = container || document;

        if (!fetch_container.querySelectorAll) {
            return;
        }

        // const tags_selector = this.__addAttributeSelectorTags('h1, h2, h3, h4, h5, h6, p, i, q, a, b, li, span, code, div.domEditor, img, body, html')
        const tags_selector = this.__addAttributeSelectorTags(this.selector)
        let elements = fetch_container.querySelectorAll(tags_selector)
        let requestData = [];

        if (elements.length == 0 && fetch_container != document && fetch_container.hasAttribute('data-document_id')) {
            elements = [fetch_container];
        }

        elements.forEach((el) => {

            const collection = el.getAttribute('data-collection') || "module_activity"
            const id = el.getAttribute('data-document_id')
            const readValue = CoCreateUtils.isReadValue(el);


            if (readValue && id && !requestData.some((d) => d['collection'] === collection && d['document_id'] === id)) {
                requestData.push({
                    'collection': collection,
                    'document_id': id
                })
            }
        })
        return requestData;
    },


    __initAttribute: function (container) {

        const mainContainer = container || document;

        if (!mainContainer.querySelectorAll) {
            return;
        }

        // const tags_selector = this.__addAttributeSelectorTags('h1, h2, h3, h4, h5, h6, p, i, q, a, b, li, span, code, div.domEditor, img, body, html')
        const tags_selector = this.__addAttributeSelectorTags(this.selector)

        let elements = mainContainer.querySelectorAll(tags_selector)

        if (elements.length == 0 && mainContainer != document && mainContainer.hasAttribute('data-document_id')) {
            elements = [mainContainer]
        }

        elements.forEach((el) => {
            const collection = el.getAttribute('data-collection')
            const id = el.getAttribute('data-document_id')
            const name = el.getAttribute('name')

            if (collection && id && name && el.getAttribute('data-realtime') == null) {
                el.setAttribute('data-realtime', true)
            }
        })
    },

    __initSocket: function () {
        const self = this;
        CoCreateSocket.listen('updateDocument', function (data) {
            self.render(data)
        })
        CoCreateSocket.listen('readDocument', function (data) {
            self.render(data)
        })

        CoCreateSocket.listen('connect', function (data) {
            // self.__getReqeust()
            const requests = self.__getReqeust()
            if (requests) {
                requests.forEach((req) => {
                    CoCreate.readDocument({
                        collection: req['collection'],
                        document_id: req['document_id']
                    })
                })
            }
        })
    },

    __initEvents: function () {
        const self = this;
        document.addEventListener('change-content', function (event) {
            const { element, broadcast, broadcast_sender } = event.detail;
            if (!element) {
                return;
            }

            const domEl = self.findElementByChild(element)
            if (domEl) {
                self.save(domEl, broadcast, broadcast_sender)
            }

        })
    },

    __addAttributeSelectorTags: function (str_tags) {
        let tags = str_tags.trim().split(/\s*,\s*/).map(function (tag) {
            return tag + "[data-collection][data-document_id][name]";
        });
        return tags.join(", ");
    },

    findElementByChild: function (element) {
        return CoCreateUtils.getParentFromElement(element, 'domEditor');
    },

    __getValueFromJonDeep: function (json, path) {
        try {
            if (typeof json == 'undefined')
                return false;
            let subpath = path.split('.');
            let find = subpath.shift();
            if (subpath.length > 0) {
                return this.__getValueFromJonDeep(json[find], subpath.join('.'))
            }
            return json[find];
        } catch (error) {
            console.log(error)
            return false;
        }
    },

}

CoCreateHtmlTags.init();
CoCreateInit.register('CoCreateHtmlTags', CoCreateHtmlTags, CoCreateHtmlTags.initElement);


console.log('domEditor is loading from', window.location.pathname)






CoCreateSocket.listen('domEditor', function (data) {
    console.log('raw object recieved: ', data.target, data.value[1], window.location.pathname)
    // resolving the element_id to real element in the clinet
    data.target = document.querySelector(`[data-element_id="${data.target}"]`);
    data.value[1] = document.querySelector(`[data-element_id="${data.value[1]}"]`);
    if (!data.target)
        console.error('dnd error: draggble is null')
    if (!data.value[1])
        console.error('dnd error: droppable is null')
    // passing it to domEditor
    domEditor(data);
})


/* domEditor Object Example

  domEditor({
      target: 'object',
      selector_type: 'querySelectorAll',
      selector: '*',
      method: 'setAttribute',
      index : null,
      property : null,
      value : '{'first_attr':'cvalue','second_attr':'value'}',
  });
 */


/**
 * domEditor used to run a dom command in remote and now used to do all sort of things
 * 
 * @param paramObject param objects
 * @param {element} [paramObject.context=document] the context in which the selector_type and selector is called to resolve to a/list of target
 * @param {element|element[]} [paramObject.target] alternatively you can feed the target by setting target. if you set target, selector_type, selector and context is skiped.
 * @param {integer} [paramObject.index=null] if the index specified and target be an array, it will select that target in that array
 * @param {string} [paramObject.selector_type] selector_type will be called on context, example: querySelectorAll, querySelector, getElementById,
 * @param {string} [paramObject.selector] is the parameter of the selector_type and applied to it, example: #id_example, .class
 * @param {string} [paramObject.method=null] the method that will be called on targets
 * @param {string} [paramObject.property] css property can alternatively define here. example: null,length,color
 * @param {string|array|object} [paramObject.value] if method param is defined, value is applied as a parameter, example: â€œhola, heyâ€ ; â€œholaâ€, â€œheyâ€;  â€œstringâ€; {â€˜first_attr':'cvalue','second_attr':'value'},  ['positon', 'value']
    if you give an array it is going to invoke method for every element in the array

   @returns if method is not defined the target is returned otherwise the result of all method invokation is returned
 *
 */



/**
 * assign to a property, if method is not a function the value will be assigned
 domEditor({
   target: 'object',
   method: 'setAttribute',
   value : 'value',
 });
 */

function domEditor({ context, target, selector_type, selector, method, index, property, sub_property, value, idGenerator }) {


    if (!context)
        context = document;



    if (!target) {
        if (!context[selector_type]) {
            console.error('selector type not supported', selector_type)
            throw new Error('selector type not supported.' + selector_type)
        }

        target = context[selector_type](selector);
        if (!target)
            return null;
    }

    if (index && target[index])
        target = target[index];

    let targets = (target.length > 0) ? target : [target];

    for (target of targets) {
        if (target instanceof NodeList)
            continue;
        if (target && idGenerator) {
            if (!target.getAttribute('data-element_id'))
                target.setAttribute('data-element_id', idGenerator())
        }
    }


    if (!method)
        return target;

    let results = [];
    let element;
    targets.forEach(target => {
        let result = apply_method({ target, method, property, value, idGenerator })
        if (result)
            results.push(result);
        else
            element = target[method]

    })
    if (element) return element;
    return results;
}


function apply_method({ target, method, property, value, mutliValue, idGenerator }) {
    let results = [];

    if (target instanceof NodeList)
        return;

    if (typeof value == 'string')
        value = [value];

    if (method == 'style')
        if (value) {
            target[method][property] = value;
            return;
        }
        else {
            return target[method][property];
        }

    let querySection = method.split(".");
    let func = querySection.reduce((a, c) => a[c], target);
    let lastEl = querySection.pop();
    let env = querySection.reduce((a, c) => a[c], target);

    if (typeof env[lastEl] != 'function') {
        if (value) {
            env[lastEl] = value;
            return;
        }
        else {
            return env[lastEl];
        }
    }


    try {
        if (!value && typeof env[lastEl] == 'function')
            env[lastEl]();

    }
    catch (error) {
        console.warn(`failed to call ${lastEl}, `, error)
    }


    if (Array.isArray(value)) {
        let result = func.apply(env, value)
        results.push(result)
    }
    else if (typeof value == 'object') {
        Object.entries(value).forEach((e) => {
            let result = func.apply(env, e)
            results.push(result)
        });
    }


    return results;
}




function domElements() {

}


function UUID(length = 10) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    var d = new Date().toTimeString();
    var random = d.replace(/[\W_]+/g, "").substr(0, 6);
    result += random;
    return result;
}



// dom.element([{
//     displayname: 'defualt'
//     selector: ['body, body *'],
//     draggable: 'false',
//     droppable: 'true',
//     hoverable: 'true',
//     selectable: 'true',
//     classes: '[]',
//     attributtes: '[]',
//     editable: 'true',
//     // toolbar: { 'test': 'testing this' },
//   },
//   {
//     displayname: 'select'
//     selector: 'select',
//     editable: 'false'
//   }
// ], { context: newElement });
// );

// dom.element([{
//     selector: ['body, body *'],
//     classes: '[]',
//     attributtes: '[]',
//   },

domElements.prototype.element = function (listOftodo, sharedConfig = {}) {


    if (!Array.isArray(listOftodo))
        listOftodo = [listOftodo];

    for (todo of listOftodo) {

        let {
            displayName,
            classes,
            attributtes,
            draggable,
            droppable,
            selectable,
            editable,
            hoverable,
            cloneable,
            ...rest
        } = todo;



        var dataset = {
            ...(displayName ? { "data-name": displayName } : {})
        };
        let vardroppable = "data-droppable";
        let vardraggable = "data-draggable";
        let varcloneable = "data-cloneable";
        let varselectable = "data-selectable";
        let vareditable = "data-editable";
        let varhoverable = "data-hoverable";
        let varname = "data-name";
        let vargroup_name = "data-group_name";
        let vardata_insert_html = "data-insert-html";

        if (draggable) dataset[vardraggable] = draggable;
        if (droppable) dataset[vardroppable] = droppable;
        if (selectable) dataset[varselectable] = selectable;
        if (editable) dataset[vareditable] = editable;
        if (hoverable) dataset[varhoverable] = hoverable;
        if (cloneable) dataset[varcloneable] = cloneable;

        domEditor({ context: sharedConfig.context, ...rest, selector_type: 'querySelectorAll', method: 'setAttribute', value: dataset, idGenerator: UUID });
        domEditor({ context: sharedConfig.context, ...rest, selector_type: 'querySelectorAll', method: 'classList.add', value: classes, idGenerator: UUID });
        domEditor({ context: sharedConfig.context, ...rest, selector_type: 'querySelectorAll', method: 'setAttribute', value: attributtes, idGenerator: UUID });

    }
    console.log('domEditor element end')


}

window.dom = new domElements();
console.log('domEditor is loaded from', window.location.pathname)

const CoCreateClone = {
    __cloneBtnClass: 'cloneBtn',
    __deleteBtnClass: 'deleteBtn',

    init: function () {
        this.__initButtonEvent();
    },

    __initButtonEvent: function () {
        const self = this;
        document.addEventListener('click', function (e) {
            for (let i = 0; i < e.path.length; i++) {
                let tag = e.path[i];

                if (tag.classList && tag.classList.contains(self.__cloneBtnClass)) {
                    self.__cloneElement(tag)
                }

                if (tag.classList && tag.classList.contains(self.__deleteBtnClass)) {
                    self.__deleteElement(tag)
                }
            }
        })
    },

    __cloneElement: function (cloneBtn) {
        const cloneId = cloneBtn.getAttribute("data-clone_id");
        const clone_name_id = cloneBtn.getAttribute('data-clone_name');
        const clone_position = cloneBtn.getAttribute('data-clone_position') || 'before';
        if (!cloneId) return;

        let clone_name;

        let input = document.getElementById(clone_name_id);

        if (input) {
            clone_name = input.value ? input.value : '';
        }

        let template = document.getElementById(cloneId);
        if (!template) return;

        let clonedItem = template.cloneNode(true);

        if (clonedItem.classList.contains('template')) {
            clonedItem.classList.remove('template');
        }

        clonedItem.classList.add('clonedItem');

        //// remove data-pass_value_id from clonedItem
        clonedItem.removeAttribute('data-pass_value_id');
        let tags = clonedItem.querySelectorAll("*");

        tags.forEach((tag) => {
            tag.removeAttribute('data-pass_value_id');
        })

        let prefix = this.__getNewPrefix(clone_name);

        clonedItem.setAttribute('prefix', prefix);
        this.__createDynamicCloneId(clonedItem, prefix);

        //. create data-element_id for dnd
        this.__createDnDElementId(clonedItem);

        if (clone_position === "after") {
            if (template.nextSibling) {
                template.parentNode.insertBefore(clonedItem, template.nextSibling);
            } else {
                template.parentNode.appendChild(clonedItem);
            }
        } else {
            template.parentNode.insertBefore(clonedItem, template);
        }

        const domEditorEl = CoCreateHtmlTags.findElementByChild(clonedItem);
        if (domEditorEl) {
            this.__sendMessageOfClone(domEditorEl, clonedItem, cloneId, clone_position);
        }

        //. cloned event
        document.dispatchEvent(new CustomEvent('change-content', {
            detail: {
                element: clonedItem,
                type: 'clone-create'
            }
        }))
        template.parentNode.dispatchEvent(new CustomEvent('CoCreate-clone', {
            detail: {
                type: 'create'
            }
        }));
    },

    __deleteElement: function (deleteBtn) {

        let id = deleteBtn.getAttribute('data-clone_id');

        let item = document.getElementById(id);

        if (item) {
            const parentNode = item.parentNode;
            item.remove();

            this.__sendMessageOfDelete(id);

            //. cloned event
            if (parentNode) {
                document.dispatchEvent(new CustomEvent('change-content', {
                    detail: {
                        element: parentNode,
                        type: 'clone-delete'
                    }
                }))
                parentNode.dispatchEvent(new CustomEvent('CoCreate-clone', {
                    detail: {
                        type: 'delete'
                    }
                }));
            }
        }
    },

    __createDynamicCloneId: function (clonedItem, prefix) {
        const self = this;
        let tags = clonedItem.querySelectorAll("*");
        let cloneBtns = clonedItem.querySelectorAll('.' + this.__cloneBtnClass);
        let deleteBtns = clonedItem.querySelectorAll('.' + this.__deleteBtnClass);

        tags = Array.from(tags);
        tags.push(clonedItem);
        tags.forEach((tag) => {
            let name = tag.getAttribute('name');
            if (name) self.__setAttribute(tag, 'name', name, prefix);
        })

        self.__setAttribute(clonedItem, 'id', clonedItem.id, prefix)

        /** set data-xxxx="[prefix][any]" **/
        tags.forEach((el) => {
            let tag = el.tagName.toLowerCase();
            for (var i = 0; i < el.attributes.length; i++) {
                const { name, value } = el.attributes[i];
                // const changedValue = value.replace(/\[prefix\]/g, prefix);
                const changedValue = value.replace(/{{\s*clone-name\s*}}/g, prefix);
                if (/{{\s*clone-name\s*}}/g.test(value) && name == "value") {
                    switch (tag) {
                        case 'input':
                            el.setAttribute("value", changedValue);
                            break;
                        case 'textarea':
                            el.setAttribute("value", changedValue);
                            el.textContent = changedValue;
                            break;
                        default:
                            el.innerHTML = changedValue;
                    }
                }
                el.setAttribute(name, changedValue)
            }
        })

        cloneBtns.forEach((btn) => {
            let clone_id = btn.getAttribute('data-clone_id');
            let clone_name_id = btn.getAttribute('data-clone_name');

            if (clone_id) {
                let clonableItem = clonedItem.querySelector(`#${clone_id}`);
                let newId = self.__setAttribute(btn, 'data-clone_id', clone_id, prefix)
                if (clonableItem) clonableItem.id = newId;
            }

            if (clone_name_id) {
                let clone_name_input = clonedItem.querySelector(`#${clone_name_id}`)
                let newName = self.__setAttribute(btn, 'data-clone_name', clone_name_id, prefix)
                if (clone_name_input) clone_name_input.id = newName;
            }
        })

        deleteBtns.forEach((btn) => {
            let clone_id = btn.getAttribute('data-clone_id');
            if (clone_id) self.__setAttribute(btn, 'data-clone_id', clone_id, prefix)
        })
    },

    __getOriginal: function (str) {
        let original = str;
        let index = str.indexOf('_');
        if (index > -1) original = str.substring(index + 1);
        return original;
    },

    __setAttribute: function (element, attrName, value, prefix) {
        let orgValue = this.__getOriginal(value)
        let newValue = prefix == '' ? orgValue : `${prefix}_${orgValue}`;
        element.setAttribute(attrName, newValue)
        return newValue;
    },

    __createDnDElementId: function (clonedItem) {
        let dnd_elements = document.querySelectorAll('[data-draggable="true"], [data-droppable="true"]')

        dnd_elements.forEach((el) => {
            el.setAttribute('data-element_id', CoCreateUtils.generateUUID());
        })

        if (clonedItem.getAttribute('data-draggable') == "true" || clonedItem.getAttribute('data-droppable') == "true") {
            clonedItem.setAttribute('data-element_id', CoCreateUtils.generateUUID());
        }
    },

    __getNewPrefix: function (clone_name) {
        let clonedItems = document.querySelectorAll('.clonedItem');
        let exist = false;

        clonedItems.forEach((el) => {
            let prefix = el.getAttribute('prefix');
            if (clone_name == prefix) {
                exist = true;
                return;
            }
        })

        if (exist || !clone_name) {
            return CoCreateUtils.generateUUID(12);
        } else {
            return clone_name;
        }
    },

    __sendMessageOfClone: function (parent, item, id, position) {
        const document_id = parent.getAttribute('data-document_id');
        const name = parent.getAttribute('name')

        let value = {}
        if (position == 'after') {
            value = { 'afterend': item.outerHTML }
        } else {
            value = { 'beforebegin': item.outerHTML }
        }

        const message = {
            selector_type: 'querySelector',
            selector: `div.domEditor[data-document_id='${document_id}'][name='${name}'] #${id}.template`,
            method: 'insertAdjacentHTML',
            value: value
        }

        CoCreate.sendMessage({
            rooms: [],
            emit: {
                message: 'domEditor',
                data: message
            },
        })
    },

    __sendMessageOfDelete: function (element_id) {
        const message = {
            selector_type: 'getElementById',
            selector: element_id,
            method: 'remove',
        }

        CoCreate.sendMessage({
            rooms: [],
            emit: {
                message: 'domEditor',
                data: message
            }
        })
    }
}

CoCreateClone.init();
var permissionClass = 'checkPermission';
var usersCollection = 'users';
var orgCollection = "organizations";
var createdUserId = "";
var createdOrgId = "";


var redirectClass = 'redirectLink';

checkSession();
initSocketsForUsers();
fetchUser();
initLoginForms();
initCurrentOrgEles();
initLogoutBtn();
//initRegisterForms();

var getOrg = false;
var updatedCurrentOrg = false;


function initSocketsForUsers() {
    CoCreateSocket.listen('fetchedUser', function (data) {
        fetchedUser(data);
    })

    CoCreateSocket.listen('login', function (data) {
        loginResult(data);
    })

    CoCreateSocket.listen('createDocument', function (data) {
        registerResult(data);
    })

    CoCreateSocket.listen('usersCurrentOrg', function (data) {

        updatedCurrentOrg = true;
        getOrg = true;

        localStorage.setItem('apiKey', data['apiKey']);
        localStorage.setItem('securityKey', data['securityKey']);
        localStorage.setItem('organization_id', data['current_org']);

        localStorage.setItem('adminUI_id', data['adminUI_id']);
        localStorage.setItem('builderUI_id', data['builderUI_id']);

        //. fire fetchedUsersCurrentOrg
        document.dispatchEvent(new CustomEvent('fetchedUsersCurrentOrg'));

        if (data.href) {
            window.location.href = data.href;
        }
    })

    CoCreate.listenMessage('changedUserStatus', function (data) {
        changedUserStatus(data)
    })
}

function fetchUser() {

    var user_id = localStorage.getItem('user_id');

    if (user_id) {
        var json = {
            "apiKey": config.apiKey,
            "securityKey": config.securityKey,
            "organization_id": config.organization_Id,
            "data-collection": usersCollection,
            "user_id": user_id
        }

        CoCreateSocket.send('fetchUser', json);
    }
}

function fetchedUser(data) {
    console.log(data);

    checkPermissions(data);
}

function checkPermissions(data) {
    var tags = document.querySelectorAll('.' + permissionClass);

    console.log(tags);

    for (var i = 0; i < tags.length; i++) {
        var tag = tags[i];

        var module_id = tag.getAttribute('data-document_id') ? tag.getAttribute('data-document_id') : tag.getAttribute('data-pass_document_id');
        var data_permission = tag.getAttribute('data-permission');

        var userPermission = data['permission-' + module_id];

        console.log(userPermission);

        if (userPermission.indexOf(data_permission) == -1) {
            switch (data_permission) {
                case 'create':
                    tag.style.display = 'none';
                    break;
                case 'read':
                    tag.style.display = 'none';
                    break;
                case 'delete':
                    tag.style.display = 'none';
                    break;
                case 'delete':
                    tag.readOnly = true;
                    break;
                default:
                // code
            }
        } else {
            switch (data_permission) {

                // code
            }
        }
    }
}

function initLoginForms() {
    var forms = document.querySelectorAll('form');

    for (var i = 0; i < forms.length; i++) {
        initLoginForm(forms[i]);
    }
}

function initLoginForm(form) {

    var loginBtn = form.querySelector('.loginBtn');

    if (!loginBtn) return;

    loginBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();

        let collection = form.getAttribute('data-collection') || 'module_activity';
        let loginData = {};

        const inputs = form.querySelectorAll('input, textarea');

        inputs.forEach((input) => {
            const name = input.getAttribute('name');
            let value = input.value;
            if (input.type == 'password') {
                value = btoa(value);
            }
            collection = input.getAttribute('data-collection') || collection;

            if (name) {
                loginData[name] = value;
            }
        })

        var json = {
            "apiKey": config.apiKey,
            "securityKey": config.securityKey,
            "organization_id": config.organization_Id,
            "data-collection": collection,
            "loginData": loginData
        }

        CoCreateSocket.send('login', json);
    })
}

function loginResult(data) {
    if (data.success) {
        localStorage.setItem('user_id', data['id']);
        let href = "";
        let aTag = document.querySelector("form .loginBtn a");
        if (aTag) {
            href = aTag.getAttribute('href');
        }

        getCurrentOrg(data['id'], data['collection'], href);

    } else {
        console.log("can't login");
    }
}


function getCurrentOrg(user_id, collection, href) {
    var json = {
        "data-collection": collection || usersCollection,
        "user_id": user_id,
        "href": href
    }

    CoCreateSocket.send('usersCurrentOrg', json);
}

function registerResult(data) {

    if (data['collection'] === orgCollection) {
        createdOrgId = data['document_id'];
    }

    if (data['collection'] === usersCollection) {
        createdUserId = data['document_id'];
    }

    if (createdOrgId && createdUserId) {
        CoCreate.updateDocument({
            broadcast: false,
            collection: usersCollection,
            document_id: createdUserId,
            data: {
                current_org: createdOrgId,
                connected_orgs: [createdOrgId]
            }
        })

        localStorage.setItem('user_id', createdUserId)
        // let aTag = document.querySelector(".registerBtn > a");
        // let href = "";
        // if (aTag) {
        //   href= aTag.getAttribute("href");
        // }

        getCurrentOrg(createdUserId, usersCollection, null);
    }
}

function initCurrentOrgEles() {
    var user_id = localStorage.getItem('user_id');

    if (!user_id) return;

    let orgChangers = document.querySelectorAll('.org-changer');

    for (let i = 0; i < orgChangers.length; i++) {
        let orgChanger = orgChangers[i];

        var collection = orgChanger.getAttribute('data-collection') ? orgChanger.getAttribute('data-collection') : 'module_activity';
        var id = orgChanger.getAttribute('data-document_id');

        if (collection == 'users' && id == user_id) {
            orgChanger.addEventListener('selectedValue', function (e) {

                setTimeout(function () {
                    getCurrentOrg(user_id);

                    var timer = setInterval(function () {
                        if (updatedCurrentOrg) {
                            location.reload();

                            clearInterval(timer);
                        }
                    }, 100)
                }, 300)
            })
        }
    }
}

function initLogoutBtn() {
    let logoutBtns = document.querySelectorAll('.logoutBtn');

    for (let i = 0; i < logoutBtns.length; i++) {
        let logoutBtn = logoutBtns[i];

        logoutBtn.addEventListener('click', function (e) {
            e.preventDefault();

            localStorage.clear();

            let href = this.getAttribute('href');
            if (href) document.location.href = href;
        })
    }
}

function checkSession() {

    var user_id = localStorage.getItem('user_id');

    if (user_id) {
        var redirectTag = document.querySelector('.sessionTrue');

        if (redirectTag) {
            let redirectLink = redirectTag.getAttribute('href');
            if (redirectLink) {
                document.location.href = redirectLink
            }
        }
    } else {
        var redirectTag = document.querySelector('.sessionFalse');

        if (redirectTag) {
            let redirectLink = redirectTag.getAttribute('href');
            if (redirectLink) {
                localStorage.clear();
                document.location.href = redirectLink
            }
        }
    }
}

function changedUserStatus(data) {
    if (!data.user_id) {
        return;
    }
    let statusEls = document.querySelectorAll(`[data-user_status][data-document_id='${data['user_id']}']`)

    statusEls.forEach((el) => {
        el.setAttribute('data-user_status', data['status']);
    })
}



/*!
* https://cocreate.app
* https://github.com/CoCreate-app/Conditional_Logic
* Released under the MIT license
* https://github.com/CoCreate-app/Conditional_Logic/blob/master/LICENSE
*/

initShowHideEles();

document.addEventListener('fetchedTemplate', () => {
    initShowHideEles();
})

function initShowHideEles() {
    // var showHideEles = document.getElementsByClassName("show_hide");
    var showHideEles = document.querySelectorAll('[data-show],[data-hide]');

    for (let el of showHideEles) {

        if (el.tagName.toLowerCase() == "option")
            el = el.closest('select');

        el.removeEventListener('change', selectShowHideEle);
        el.removeEventListener("click", clickShowHideEle);

        el.addEventListener("change", selectShowHideEle);
        el.addEventListener("click", clickShowHideEle);
    }
}

function selectShowHideEle(e) {
    console.log(this, 'select');
    e.preventDefault()
    var select = this;
    if (typeof select.options != 'undefined')
        for (var i = 0, len = select.options.length; i < len; i++) {
            var opt = select.options[i];
            var value = opt.value
            if (value != '') {
                var show = opt.dataset.show
                // var show_class = opt.dataset.showClass
                if (typeof show != 'undefined') {
                    for (let el of document.querySelectorAll(show))
                        el.classList.add('hidden');
                    if (opt.selected === true) {
                        for (let el of document.querySelectorAll(show))
                            el.classList.remove('hidden');
                    }
                }
            }//end value is not empty
        }//end for
}

function clickShowHideEle(e) {
    console.log(this, 'click');
    var show = this.dataset.show;
    var hide = this.dataset.hide;
    let tagName = this.tagName.toLowerCase();

    if (tagName == 'input' && this.getAttribute("type").toLowerCase() == 'radio') {
        let name = this.getAttribute("name")
        let radios = document.querySelectorAll(tagName + '[name="' + name + '"]');
        for (let radio of radios) {

            show = radio.dataset.show;

            for (let el of document.querySelectorAll(show)) {
                el.classList.add('hidden');
            }

            if (radio.checked) {
                for (let el of document.querySelectorAll(show))
                    el.classList.remove('hidden');
            }
        }

    } else {

        let updated_els = [];

        for (let el of document.querySelectorAll(show)) {
            if (el.classList.contains('hidden')) {
                el.classList.remove('hidden');
                updated_els.push(el);
            }
        }

        for (let el of document.querySelectorAll(hide)) {
            let existEqual = false;
            for (let uel of updated_els) {
                if (el.isEqualNode(uel)) {
                    existEqual = true;
                    break;
                }
            }

            if (!existEqual) el.classList.add('hidden');
        }
    }
}


var CoCreateCalculation = {
    init: function () {
        this.initCalculationElements();
    },


    initCalculationElements: function (container) {
        const mainContainer = container || document;
        if (!mainContainer.querySelectorAll) {
            return;
        }
        let calculationElements = mainContainer.querySelectorAll('[data-calculation]');

        if (mainContainer != document && mainContainer.hasAttribute('data-calculation')) {
            calculationElements.push(mainContainer);
        }

        for (let i = 0; i < calculationElements.length; i++) {
            if (CoCreateInit.getInitialized(calculationElements[i])) {
                return;
            }
            CoCreateInit.setInitialized(calculationElements[i])

            this.initCalculationElement(calculationElements[i]);
        }

    },

    initCalculationElement: function (ele) {

        this.setCalcationResult(ele);
        const self = this;
        let data_calculation = ele.getAttribute('data-calculation');
        let ids = this.getIds(data_calculation);

        for (let i = 0; i < ids.length; i++) {
            let id = ids[i];

            let input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', function () {
                    self.setCalcationResult(ele);
                })
            }
        }
    },


    setCalcationResult: function (ele) {
        let data_calculation = ele.getAttribute('data-calculation');

        let calString = this.replaceIdWithValue(data_calculation);

        console.log(calString);

        let result = calculation(calString);

        if (ele.tagName == 'INPUT' || ele.tagName == 'TEXTAREA' || ele.tagName == 'SELECT') {
            ele.value = result
        } else {
            ele.innerHTML = result;
        }
    },

    replaceIdWithValue: function (data_calculation) {
        let ids = this.getIds(data_calculation);

        for (let i = 0; i < ids.length; i++) {
            let id = ids[i];

            let input = document.getElementById(id);
            if (input) {
                let value = Number(input.value);

                data_calculation = data_calculation.replace(new RegExp('{' + id + '}', 'g'), value);
            }
        }

        return data_calculation;
    },

    getIds: function (string) {
        let tmp = string;

        let ids = []
        while (tmp.length > 0) {
            let firstIndex = tmp.indexOf('{');
            let secondIndex = tmp.indexOf('}', firstIndex);

            if (firstIndex > -1 && secondIndex > -1) {
                let id = tmp.substring(firstIndex + 1, secondIndex);

                if (ids.indexOf(id) == -1) ids.push(id);

                tmp = tmp.substring(secondIndex + 1);

            } else {
                return ids;
            }
        }

        return ids;
    },
}

function calculation(string) {
    let index1, index2, index3, index4;

    index1 = string.indexOf('+');
    index2 = string.indexOf('-');
    index3 = string.indexOf('*');
    index4 = string.indexOf('/');


    if (index1 > -1) {
        let lStr = string.substr(0, index1);
        let rStr = string.substr(index1 + 1);

        return calculation(lStr) + calculation(rStr);

    } else if (index2 > -1) {
        let lStr = string.substr(0, index2);
        let rStr = string.substr(index2 + 1);

        return calculation(lStr) - calculation(rStr);

    } else if (index3 > -1) {
        let lStr = string.substr(0, index3);
        let rStr = string.substr(index3 + 1);

        return calculation(lStr) * calculation(rStr);
    } else if (index4 > -1) {
        let lStr = string.substr(0, index4);
        let rStr = string.substr(index4 + 1);

        let lValue = calculation(lStr);
        let rValue = calculation(rStr);

        if (rValue == 0) {
            return 0;
        } else {
            return lValue / rValue;
        }

    } else {
        let result = Number(string);

        if (isNaN(result)) {
            return 0;
        } else {
            return result;
        }


    }

}

CoCreateCalculation.init();

// CoCreateInit.register_old('[data-calculation]',CoCreateCalculation.initCalculationElement);
CoCreateInit.register('CoCreateCalculation', CoCreateCalculation, CoCreateCalculation.initCalculationElements);

const CoCreateToggle = {

    init: function () {
        this.initElement(document, 'toggle');
        this.initElement(document, 'hover');
    },

    initElement: function (container, prefix) {
        let mainContainer = container || document;
        const self = this;
        if (!mainContainer.querySelectorAll) {
            return;
        }

        let elements = mainContainer.querySelectorAll(`[data-${prefix}]`);
        if (elements.length === 0 && mainContainer != document && mainContainer.hasAttributes(`[data-${prefix}]`)) {
            elements = [mainContainer];
        }

        elements.forEach((element) => self.__initElementEvent(element, prefix));
    },

    __initElementEvent: function (element, prefix) {

        const self = this;
        let eventNames = [];

        if (prefix === 'toggle') eventNames = ['click']
        if (prefix === 'hover') eventNames = ['mouseover', 'mouseout'];

        eventNames.forEach((event_name) => {
            element.addEventListener(event_name, function () {
                self.__changeElementStatus(element, prefix)
            });
        })
    },

    __changeElementStatus: function (element, prefix) {
        const self = this;
        let values = element.dataset[prefix].split(',');
        if (!values || values.length == 0) {
            return;
        }

        let target_attribute = element.dataset[`${prefix}_attribute`] || 'class';
        let targetSelector = element.dataset[`${prefix}_element`];
        let targetClosest = element.dataset[`${prefix}_closest`];

        let targetElements = [element]
        if (typeof (targetClosest) != 'undefined') {
            targetElements = [element.closest(targetClosest)];
        }

        if (targetSelector) {
            targetElements = document.querySelectorAll(targetSelector);
        }

        values = values.map(x => x.trim())
        targetElements.forEach((el) => self.setValue(el, target_attribute, values));
    },

    setValue: function (element, attrName, values) {
        if (element.getAttribute(attrName) === null) {
            return;
        }
        let attrValues = element.getAttribute(attrName).split(' ').map(x => x.trim());
        let oldValue = values.filter(x => attrValues.includes(x))[0] || '';
        let newValue = this.__getNextValue(values, oldValue)

        if (attrName === 'class') {
            if (oldValue != '') {
                element.classList.remove(oldValue);
                if (values.length === 1) {
                    return;
                }
            }

            if (newValue != '') {
                element.classList.add(newValue);
            }
        } else {
            element.setAttribute(attrName, newValue);
        }
    },

    __getNextValue: function (values, val) {
        let size = values.length;
        let nn = values.indexOf(val);
        if (nn == -1) {
            return values[0];
        } else {
            return values[(nn + 1) % size];
        }
    }
}

CoCreateToggle.init();
!function (t) { var e = {}; function n(r) { if (e[r]) return e[r].exports; var s = e[r] = { i: r, l: !1, exports: {} }; return t[r].call(s.exports, s, s.exports, n), s.l = !0, s.exports } n.m = t, n.c = e, n.d = function (t, e, r) { n.o(t, e) || Object.defineProperty(t, e, { enumerable: !0, get: r }) }, n.r = function (t) { "undefined" != typeof Symbol && Symbol.toStringTag && Object.defineProperty(t, Symbol.toStringTag, { value: "Module" }), Object.defineProperty(t, "__esModule", { value: !0 }) }, n.t = function (t, e) { if (1 & e && (t = n(t)), 8 & e) return t; if (4 & e && "object" == typeof t && t && t.__esModule) return t; var r = Object.create(null); if (n.r(r), Object.defineProperty(r, "default", { enumerable: !0, value: t }), 2 & e && "string" != typeof t) for (var s in t) n.d(r, s, function (e) { return t[e] }.bind(null, s)); return r }, n.n = function (t) { var e = t && t.__esModule ? function () { return t.default } : function () { return t }; return n.d(e, "a", e), e }, n.o = function (t, e) { return Object.prototype.hasOwnProperty.call(t, e) }, n.p = "./dist/", n(n.s = 19) }([function (t, e, n) { "use strict"; n.d(e, "b", (function () { return r })), n.d(e, "c", (function () { return s })), n.d(e, "a", (function () { return i })); const r = () => new Map, s = (t, e, n) => { let r = t.get(e); return void 0 === r && t.set(e, r = n()), r }, i = (t, e) => { for (const [n, r] of t) if (e(r, n)) return !0; return !1 } }, function (t, e, n) { "use strict"; (function (t) { n.d(e, "c", (function () { return o })), n.d(e, "b", (function () { return l })), n.d(e, "e", (function () { return c })), n.d(e, "d", (function () { return a })), n.d(e, "a", (function () { return u })); var r = n(3), s = n(9); const i = t => new Uint8Array(t), o = (t, e, n) => new Uint8Array(t, e, n), l = t => new Uint8Array(t), c = s.a ? t => { let e = ""; for (let n = 0; n < t.byteLength; n++)e += r.d(t[n]); return btoa(e) } : e => t.from(e.buffer, e.byteOffset, e.byteLength).toString("base64"), a = s.a ? t => { const e = atob(t), n = i(e.length); for (let t = 0; t < e.length; t++)n[t] = e.charCodeAt(t); return n } : e => new Uint8Array(t.from(e, "base64").buffer), u = t => { const e = i(t.byteLength); return e.set(t), e } }).call(this, n(12).Buffer) }, function (t, e, n) { "use strict"; n.d(e, "d", (function () { return r })), n.d(e, "c", (function () { return o })), n.d(e, "b", (function () { return c })), n.d(e, "a", (function () { return u })); const r = String.fromCharCode, s = (String.fromCodePoint, /^\s*/g), i = /([A-Z])/g, o = (t, e) => (t => t.replace(s, ""))(t.replace(i, t => `${e}${(t => t.toLowerCase())(t)}`)), l = "undefined" != typeof TextEncoder ? new TextEncoder : null, c = l ? t => l.encode(t) : t => { const e = unescape(encodeURIComponent(t)), n = e.length, r = new Uint8Array(n); for (let t = 0; t < n; t++)r[t] = e.codePointAt(t); return r }; let a = "undefined" == typeof TextDecoder ? null : new TextDecoder("utf-8", { fatal: !0, ignoreBOM: !0 }); a && 1 === a.decode(new Uint8Array).length && (a = null); const u = a ? t => a.decode(t) : t => { let e = t.length, n = "", r = 0; for (; e > 0;) { const s = e < 1e4 ? e : 1e4, i = new Array(s); for (let e = 0; e < s; e++)i[e] = t[r++]; n += String.fromCodePoint.apply(null, i), e -= s } return decodeURIComponent(escape(n)) } }, function (t, e, n) { "use strict"; n.d(e, "d", (function () { return r })), n.d(e, "c", (function () { return o })), n.d(e, "b", (function () { return c })), n.d(e, "a", (function () { return u })); const r = String.fromCharCode, s = (String.fromCodePoint, /^\s*/g), i = /([A-Z])/g, o = (t, e) => (t => t.replace(s, ""))(t.replace(i, t => `${e}${(t => t.toLowerCase())(t)}`)), l = "undefined" != typeof TextEncoder ? new TextEncoder : null, c = l ? t => l.encode(t) : t => { const e = unescape(encodeURIComponent(t)), n = e.length, r = new Uint8Array(n); for (let t = 0; t < n; t++)r[t] = e.codePointAt(t); return r }, a = "undefined" == typeof TextDecoder ? null : new TextDecoder("utf-8", { fatal: !0 }), u = a ? t => a.decode(t) : t => { let e = t.length, n = "", r = 0; for (; e > 0;) { const s = e < 1e4 ? e : 1e4, i = new Array(s); for (let e = 0; e < s; e++)i[e] = t[r++]; n += String.fromCodePoint.apply(null, i), e -= s } return decodeURIComponent(escape(n)) } }, function (t, e, n) { "use strict"; n.d(e, "a", (function () { return r })), n.d(e, "b", (function () { return s })); const r = () => new Map, s = (t, e, n) => { let r = t.get(e); return void 0 === r && t.set(e, r = n()), r } }, function (t, e, n) { "use strict"; (function (t) { n.d(e, "a", (function () { return o })); var r = n(2), s = n(7); const i = t => new Uint8Array(t), o = (t, e, n) => new Uint8Array(t, e, n); s.a, s.a }).call(this, n(12).Buffer) }, function (t, e, n) { "use strict"; n.d(e, "a", (function () { return s })); let r = new class { constructor() { this.map = new Map } setItem(t, e) { this.map.set(t, e) } getItem(t) { return this.map.get(t) } }; try { "undefined" != typeof localStorage && (r = localStorage) } catch (t) { } const s = r }, function (t, e, n) { "use strict"; (function (t) { n.d(e, "a", (function () { return c })); var r = n(4), s = n(2), i = n(8), o = n(14); const l = void 0 !== t && t.release && /node|io\.js/.test(t.release.name), c = "undefined" != typeof window && !l; "undefined" != typeof navigator && /Mac/.test(navigator.platform); let a; const u = [], h = () => { if (void 0 === a) if (l) { a = r.a(); const e = t.argv; let n = null; for (let t = 0; t < e.length; t++) { const r = e[t]; "-" === r[0] ? (null !== n && a.set(n, ""), n = r) : null !== n ? (a.set(n, r), n = null) : u.push(r) } null !== n && a.set(n, "") } else a = r.a(), (location.search || "?").slice(1).split("&").forEach(t => { if (0 !== t.length) { const [e, n] = t.split("="); a.set(`--${s.c(e, "-")}`, n), a.set(`-${s.c(e, "-")}`, n) } }); return a }, f = e => l ? i.a(t.env[e.toUpperCase()]) : i.a(o.a.getItem(e)); (t => h().has(t))("--" + (d = "production")) || f(d); var d }).call(this, n(13)) }, function (t, e, n) { "use strict"; n.d(e, "a", (function () { return r })); const r = t => void 0 === t ? null : t }, function (t, e, n) { "use strict"; (function (t) { n.d(e, "a", (function () { return c })); var r = n(0), s = n(3), i = n(10), o = n(6); const l = void 0 !== t && t.release && /node|io\.js/.test(t.release.name), c = "undefined" != typeof window && !l; "undefined" != typeof navigator && /Mac/.test(navigator.platform); let a; const u = [], h = () => { if (void 0 === a) if (l) { a = r.b(); const e = t.argv; let n = null; for (let t = 0; t < e.length; t++) { const r = e[t]; "-" === r[0] ? (null !== n && a.set(n, ""), n = r) : null !== n ? (a.set(n, r), n = null) : u.push(r) } null !== n && a.set(n, "") } else a = r.b(), (location.search || "?").slice(1).split("&").forEach(t => { if (0 !== t.length) { const [e, n] = t.split("="); a.set(`--${s.c(e, "-")}`, n), a.set(`-${s.c(e, "-")}`, n) } }); return a }, f = e => l ? i.a(t.env[e.toUpperCase()]) : i.a(o.a.getItem(e)); (t => h().has(t))("--" + (d = "production")) || f(d); var d }).call(this, n(13)) }, function (t, e, n) { "use strict"; n.d(e, "a", (function () { return r })); const r = t => void 0 === t ? null : t }, function (t, e) { const n = "undefined" == typeof performance ? null : performance, r = "undefined" == typeof crypto ? null : crypto, s = null !== r ? t => { const e = new Uint8Array(t); return r.getRandomValues(e), e.buffer } : t => { const e = new Uint8Array(t); for (let n = 0; n < t; n++)e[n] = Math.ceil(4294967295 * Math.random() >>> 0); return e.buffer }; e.performance = n, e.cryptoRandomBuffer = s }, function (t, e, n) {
    "use strict"; (function (t) {
        /*!
         * The buffer module from node.js, for the browser.
         *
         * @author   Feross Aboukhadijeh <http://feross.org>
         * @license  MIT
         */
        var r = n(16), s = n(17), i = n(18); function o() { return c.TYPED_ARRAY_SUPPORT ? 2147483647 : 1073741823 } function l(t, e) { if (o() < e) throw new RangeError("Invalid typed array length"); return c.TYPED_ARRAY_SUPPORT ? (t = new Uint8Array(e)).__proto__ = c.prototype : (null === t && (t = new c(e)), t.length = e), t } function c(t, e, n) { if (!(c.TYPED_ARRAY_SUPPORT || this instanceof c)) return new c(t, e, n); if ("number" == typeof t) { if ("string" == typeof e) throw new Error("If encoding is specified then the first argument must be a string"); return h(this, t) } return a(this, t, e, n) } function a(t, e, n, r) { if ("number" == typeof e) throw new TypeError('"value" argument must not be a number'); return "undefined" != typeof ArrayBuffer && e instanceof ArrayBuffer ? function (t, e, n, r) { if (e.byteLength, n < 0 || e.byteLength < n) throw new RangeError("'offset' is out of bounds"); if (e.byteLength < n + (r || 0)) throw new RangeError("'length' is out of bounds"); e = void 0 === n && void 0 === r ? new Uint8Array(e) : void 0 === r ? new Uint8Array(e, n) : new Uint8Array(e, n, r); c.TYPED_ARRAY_SUPPORT ? (t = e).__proto__ = c.prototype : t = f(t, e); return t }(t, e, n, r) : "string" == typeof e ? function (t, e, n) { "string" == typeof n && "" !== n || (n = "utf8"); if (!c.isEncoding(n)) throw new TypeError('"encoding" must be a valid string encoding'); var r = 0 | g(e, n), s = (t = l(t, r)).write(e, n); s !== r && (t = t.slice(0, s)); return t }(t, e, n) : function (t, e) { if (c.isBuffer(e)) { var n = 0 | d(e.length); return 0 === (t = l(t, n)).length || e.copy(t, 0, 0, n), t } if (e) { if ("undefined" != typeof ArrayBuffer && e.buffer instanceof ArrayBuffer || "length" in e) return "number" != typeof e.length || (r = e.length) != r ? l(t, 0) : f(t, e); if ("Buffer" === e.type && i(e.data)) return f(t, e.data) } var r; throw new TypeError("First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.") }(t, e) } function u(t) { if ("number" != typeof t) throw new TypeError('"size" argument must be a number'); if (t < 0) throw new RangeError('"size" argument must not be negative') } function h(t, e) { if (u(e), t = l(t, e < 0 ? 0 : 0 | d(e)), !c.TYPED_ARRAY_SUPPORT) for (var n = 0; n < e; ++n)t[n] = 0; return t } function f(t, e) { var n = e.length < 0 ? 0 : 0 | d(e.length); t = l(t, n); for (var r = 0; r < n; r += 1)t[r] = 255 & e[r]; return t } function d(t) { if (t >= o()) throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x" + o().toString(16) + " bytes"); return 0 | t } function g(t, e) { if (c.isBuffer(t)) return t.length; if ("undefined" != typeof ArrayBuffer && "function" == typeof ArrayBuffer.isView && (ArrayBuffer.isView(t) || t instanceof ArrayBuffer)) return t.byteLength; "string" != typeof t && (t = "" + t); var n = t.length; if (0 === n) return 0; for (var r = !1; ;)switch (e) { case "ascii": case "latin1": case "binary": return n; case "utf8": case "utf-8": case void 0: return j(t).length; case "ucs2": case "ucs-2": case "utf16le": case "utf-16le": return 2 * n; case "hex": return n >>> 1; case "base64": return F(t).length; default: if (r) return j(t).length; e = ("" + e).toLowerCase(), r = !0 } } function p(t, e, n) { var r = !1; if ((void 0 === e || e < 0) && (e = 0), e > this.length) return ""; if ((void 0 === n || n > this.length) && (n = this.length), n <= 0) return ""; if ((n >>>= 0) <= (e >>>= 0)) return ""; for (t || (t = "utf8"); ;)switch (t) { case "hex": return I(this, e, n); case "utf8": case "utf-8": return C(this, e, n); case "ascii": return T(this, e, n); case "latin1": case "binary": return R(this, e, n); case "base64": return A(this, e, n); case "ucs2": case "ucs-2": case "utf16le": case "utf-16le": return U(this, e, n); default: if (r) throw new TypeError("Unknown encoding: " + t); t = (t + "").toLowerCase(), r = !0 } } function w(t, e, n) { var r = t[e]; t[e] = t[n], t[n] = r } function y(t, e, n, r, s) { if (0 === t.length) return -1; if ("string" == typeof n ? (r = n, n = 0) : n > 2147483647 ? n = 2147483647 : n < -2147483648 && (n = -2147483648), n = +n, isNaN(n) && (n = s ? 0 : t.length - 1), n < 0 && (n = t.length + n), n >= t.length) { if (s) return -1; n = t.length - 1 } else if (n < 0) { if (!s) return -1; n = 0 } if ("string" == typeof e && (e = c.from(e, r)), c.isBuffer(e)) return 0 === e.length ? -1 : m(t, e, n, r, s); if ("number" == typeof e) return e &= 255, c.TYPED_ARRAY_SUPPORT && "function" == typeof Uint8Array.prototype.indexOf ? s ? Uint8Array.prototype.indexOf.call(t, e, n) : Uint8Array.prototype.lastIndexOf.call(t, e, n) : m(t, [e], n, r, s); throw new TypeError("val must be string, number or Buffer") } function m(t, e, n, r, s) { var i, o = 1, l = t.length, c = e.length; if (void 0 !== r && ("ucs2" === (r = String(r).toLowerCase()) || "ucs-2" === r || "utf16le" === r || "utf-16le" === r)) { if (t.length < 2 || e.length < 2) return -1; o = 2, l /= 2, c /= 2, n /= 2 } function a(t, e) { return 1 === o ? t[e] : t.readUInt16BE(e * o) } if (s) { var u = -1; for (i = n; i < l; i++)if (a(t, i) === a(e, -1 === u ? 0 : i - u)) { if (-1 === u && (u = i), i - u + 1 === c) return u * o } else -1 !== u && (i -= i - u), u = -1 } else for (n + c > l && (n = l - c), i = n; i >= 0; i--) { for (var h = !0, f = 0; f < c; f++)if (a(t, i + f) !== a(e, f)) { h = !1; break } if (h) return i } return -1 } function b(t, e, n, r) { n = Number(n) || 0; var s = t.length - n; r ? (r = Number(r)) > s && (r = s) : r = s; var i = e.length; if (i % 2 != 0) throw new TypeError("Invalid hex string"); r > i / 2 && (r = i / 2); for (var o = 0; o < r; ++o) { var l = parseInt(e.substr(2 * o, 2), 16); if (isNaN(l)) return o; t[n + o] = l } return o } function _(t, e, n, r) { return J(j(e, t.length - n), t, n, r) } function v(t, e, n, r) { return J(function (t) { for (var e = [], n = 0; n < t.length; ++n)e.push(255 & t.charCodeAt(n)); return e }(e), t, n, r) } function S(t, e, n, r) { return v(t, e, n, r) } function E(t, e, n, r) { return J(F(e), t, n, r) } function k(t, e, n, r) { return J(function (t, e) { for (var n, r, s, i = [], o = 0; o < t.length && !((e -= 2) < 0); ++o)n = t.charCodeAt(o), r = n >> 8, s = n % 256, i.push(s), i.push(r); return i }(e, t.length - n), t, n, r) } function A(t, e, n) { return 0 === e && n === t.length ? r.fromByteArray(t) : r.fromByteArray(t.slice(e, n)) } function C(t, e, n) { n = Math.min(t.length, n); for (var r = [], s = e; s < n;) { var i, o, l, c, a = t[s], u = null, h = a > 239 ? 4 : a > 223 ? 3 : a > 191 ? 2 : 1; if (s + h <= n) switch (h) { case 1: a < 128 && (u = a); break; case 2: 128 == (192 & (i = t[s + 1])) && (c = (31 & a) << 6 | 63 & i) > 127 && (u = c); break; case 3: i = t[s + 1], o = t[s + 2], 128 == (192 & i) && 128 == (192 & o) && (c = (15 & a) << 12 | (63 & i) << 6 | 63 & o) > 2047 && (c < 55296 || c > 57343) && (u = c); break; case 4: i = t[s + 1], o = t[s + 2], l = t[s + 3], 128 == (192 & i) && 128 == (192 & o) && 128 == (192 & l) && (c = (15 & a) << 18 | (63 & i) << 12 | (63 & o) << 6 | 63 & l) > 65535 && c < 1114112 && (u = c) }null === u ? (u = 65533, h = 1) : u > 65535 && (u -= 65536, r.push(u >>> 10 & 1023 | 55296), u = 56320 | 1023 & u), r.push(u), s += h } return function (t) { var e = t.length; if (e <= 4096) return String.fromCharCode.apply(String, t); var n = "", r = 0; for (; r < e;)n += String.fromCharCode.apply(String, t.slice(r, r += 4096)); return n }(r) } e.Buffer = c, e.SlowBuffer = function (t) { +t != t && (t = 0); return c.alloc(+t) }, e.INSPECT_MAX_BYTES = 50, c.TYPED_ARRAY_SUPPORT = void 0 !== t.TYPED_ARRAY_SUPPORT ? t.TYPED_ARRAY_SUPPORT : function () { try { var t = new Uint8Array(1); return t.__proto__ = { __proto__: Uint8Array.prototype, foo: function () { return 42 } }, 42 === t.foo() && "function" == typeof t.subarray && 0 === t.subarray(1, 1).byteLength } catch (t) { return !1 } }(), e.kMaxLength = o(), c.poolSize = 8192, c._augment = function (t) { return t.__proto__ = c.prototype, t }, c.from = function (t, e, n) { return a(null, t, e, n) }, c.TYPED_ARRAY_SUPPORT && (c.prototype.__proto__ = Uint8Array.prototype, c.__proto__ = Uint8Array, "undefined" != typeof Symbol && Symbol.species && c[Symbol.species] === c && Object.defineProperty(c, Symbol.species, { value: null, configurable: !0 })), c.alloc = function (t, e, n) { return function (t, e, n, r) { return u(e), e <= 0 ? l(t, e) : void 0 !== n ? "string" == typeof r ? l(t, e).fill(n, r) : l(t, e).fill(n) : l(t, e) }(null, t, e, n) }, c.allocUnsafe = function (t) { return h(null, t) }, c.allocUnsafeSlow = function (t) { return h(null, t) }, c.isBuffer = function (t) { return !(null == t || !t._isBuffer) }, c.compare = function (t, e) { if (!c.isBuffer(t) || !c.isBuffer(e)) throw new TypeError("Arguments must be Buffers"); if (t === e) return 0; for (var n = t.length, r = e.length, s = 0, i = Math.min(n, r); s < i; ++s)if (t[s] !== e[s]) { n = t[s], r = e[s]; break } return n < r ? -1 : r < n ? 1 : 0 }, c.isEncoding = function (t) { switch (String(t).toLowerCase()) { case "hex": case "utf8": case "utf-8": case "ascii": case "latin1": case "binary": case "base64": case "ucs2": case "ucs-2": case "utf16le": case "utf-16le": return !0; default: return !1 } }, c.concat = function (t, e) { if (!i(t)) throw new TypeError('"list" argument must be an Array of Buffers'); if (0 === t.length) return c.alloc(0); var n; if (void 0 === e) for (e = 0, n = 0; n < t.length; ++n)e += t[n].length; var r = c.allocUnsafe(e), s = 0; for (n = 0; n < t.length; ++n) { var o = t[n]; if (!c.isBuffer(o)) throw new TypeError('"list" argument must be an Array of Buffers'); o.copy(r, s), s += o.length } return r }, c.byteLength = g, c.prototype._isBuffer = !0, c.prototype.swap16 = function () { var t = this.length; if (t % 2 != 0) throw new RangeError("Buffer size must be a multiple of 16-bits"); for (var e = 0; e < t; e += 2)w(this, e, e + 1); return this }, c.prototype.swap32 = function () { var t = this.length; if (t % 4 != 0) throw new RangeError("Buffer size must be a multiple of 32-bits"); for (var e = 0; e < t; e += 4)w(this, e, e + 3), w(this, e + 1, e + 2); return this }, c.prototype.swap64 = function () { var t = this.length; if (t % 8 != 0) throw new RangeError("Buffer size must be a multiple of 64-bits"); for (var e = 0; e < t; e += 8)w(this, e, e + 7), w(this, e + 1, e + 6), w(this, e + 2, e + 5), w(this, e + 3, e + 4); return this }, c.prototype.toString = function () { var t = 0 | this.length; return 0 === t ? "" : 0 === arguments.length ? C(this, 0, t) : p.apply(this, arguments) }, c.prototype.equals = function (t) { if (!c.isBuffer(t)) throw new TypeError("Argument must be a Buffer"); return this === t || 0 === c.compare(this, t) }, c.prototype.inspect = function () { var t = "", n = e.INSPECT_MAX_BYTES; return this.length > 0 && (t = this.toString("hex", 0, n).match(/.{2}/g).join(" "), this.length > n && (t += " ... ")), "<Buffer " + t + ">" }, c.prototype.compare = function (t, e, n, r, s) { if (!c.isBuffer(t)) throw new TypeError("Argument must be a Buffer"); if (void 0 === e && (e = 0), void 0 === n && (n = t ? t.length : 0), void 0 === r && (r = 0), void 0 === s && (s = this.length), e < 0 || n > t.length || r < 0 || s > this.length) throw new RangeError("out of range index"); if (r >= s && e >= n) return 0; if (r >= s) return -1; if (e >= n) return 1; if (this === t) return 0; for (var i = (s >>>= 0) - (r >>>= 0), o = (n >>>= 0) - (e >>>= 0), l = Math.min(i, o), a = this.slice(r, s), u = t.slice(e, n), h = 0; h < l; ++h)if (a[h] !== u[h]) { i = a[h], o = u[h]; break } return i < o ? -1 : o < i ? 1 : 0 }, c.prototype.includes = function (t, e, n) { return -1 !== this.indexOf(t, e, n) }, c.prototype.indexOf = function (t, e, n) { return y(this, t, e, n, !0) }, c.prototype.lastIndexOf = function (t, e, n) { return y(this, t, e, n, !1) }, c.prototype.write = function (t, e, n, r) { if (void 0 === e) r = "utf8", n = this.length, e = 0; else if (void 0 === n && "string" == typeof e) r = e, n = this.length, e = 0; else { if (!isFinite(e)) throw new Error("Buffer.write(string, encoding, offset[, length]) is no longer supported"); e |= 0, isFinite(n) ? (n |= 0, void 0 === r && (r = "utf8")) : (r = n, n = void 0) } var s = this.length - e; if ((void 0 === n || n > s) && (n = s), t.length > 0 && (n < 0 || e < 0) || e > this.length) throw new RangeError("Attempt to write outside buffer bounds"); r || (r = "utf8"); for (var i = !1; ;)switch (r) { case "hex": return b(this, t, e, n); case "utf8": case "utf-8": return _(this, t, e, n); case "ascii": return v(this, t, e, n); case "latin1": case "binary": return S(this, t, e, n); case "base64": return E(this, t, e, n); case "ucs2": case "ucs-2": case "utf16le": case "utf-16le": return k(this, t, e, n); default: if (i) throw new TypeError("Unknown encoding: " + r); r = ("" + r).toLowerCase(), i = !0 } }, c.prototype.toJSON = function () { return { type: "Buffer", data: Array.prototype.slice.call(this._arr || this, 0) } }; function T(t, e, n) { var r = ""; n = Math.min(t.length, n); for (var s = e; s < n; ++s)r += String.fromCharCode(127 & t[s]); return r } function R(t, e, n) { var r = ""; n = Math.min(t.length, n); for (var s = e; s < n; ++s)r += String.fromCharCode(t[s]); return r } function I(t, e, n) { var r = t.length; (!e || e < 0) && (e = 0), (!n || n < 0 || n > r) && (n = r); for (var s = "", i = e; i < n; ++i)s += Y(t[i]); return s } function U(t, e, n) { for (var r = t.slice(e, n), s = "", i = 0; i < r.length; i += 2)s += String.fromCharCode(r[i] + 256 * r[i + 1]); return s } function M(t, e, n) { if (t % 1 != 0 || t < 0) throw new RangeError("offset is not uint"); if (t + e > n) throw new RangeError("Trying to access beyond buffer length") } function O(t, e, n, r, s, i) { if (!c.isBuffer(t)) throw new TypeError('"buffer" argument must be a Buffer instance'); if (e > s || e < i) throw new RangeError('"value" argument is out of bounds'); if (n + r > t.length) throw new RangeError("Index out of range") } function N(t, e, n, r) { e < 0 && (e = 65535 + e + 1); for (var s = 0, i = Math.min(t.length - n, 2); s < i; ++s)t[n + s] = (e & 255 << 8 * (r ? s : 1 - s)) >>> 8 * (r ? s : 1 - s) } function P(t, e, n, r) { e < 0 && (e = 4294967295 + e + 1); for (var s = 0, i = Math.min(t.length - n, 4); s < i; ++s)t[n + s] = e >>> 8 * (r ? s : 3 - s) & 255 } function x(t, e, n, r, s, i) { if (n + r > t.length) throw new RangeError("Index out of range"); if (n < 0) throw new RangeError("Index out of range") } function D(t, e, n, r, i) { return i || x(t, 0, n, 4), s.write(t, e, n, r, 23, 4), n + 4 } function B(t, e, n, r, i) { return i || x(t, 0, n, 8), s.write(t, e, n, r, 52, 8), n + 8 } c.prototype.slice = function (t, e) { var n, r = this.length; if ((t = ~~t) < 0 ? (t += r) < 0 && (t = 0) : t > r && (t = r), (e = void 0 === e ? r : ~~e) < 0 ? (e += r) < 0 && (e = 0) : e > r && (e = r), e < t && (e = t), c.TYPED_ARRAY_SUPPORT) (n = this.subarray(t, e)).__proto__ = c.prototype; else { var s = e - t; n = new c(s, void 0); for (var i = 0; i < s; ++i)n[i] = this[i + t] } return n }, c.prototype.readUIntLE = function (t, e, n) { t |= 0, e |= 0, n || M(t, e, this.length); for (var r = this[t], s = 1, i = 0; ++i < e && (s *= 256);)r += this[t + i] * s; return r }, c.prototype.readUIntBE = function (t, e, n) { t |= 0, e |= 0, n || M(t, e, this.length); for (var r = this[t + --e], s = 1; e > 0 && (s *= 256);)r += this[t + --e] * s; return r }, c.prototype.readUInt8 = function (t, e) { return e || M(t, 1, this.length), this[t] }, c.prototype.readUInt16LE = function (t, e) { return e || M(t, 2, this.length), this[t] | this[t + 1] << 8 }, c.prototype.readUInt16BE = function (t, e) { return e || M(t, 2, this.length), this[t] << 8 | this[t + 1] }, c.prototype.readUInt32LE = function (t, e) { return e || M(t, 4, this.length), (this[t] | this[t + 1] << 8 | this[t + 2] << 16) + 16777216 * this[t + 3] }, c.prototype.readUInt32BE = function (t, e) { return e || M(t, 4, this.length), 16777216 * this[t] + (this[t + 1] << 16 | this[t + 2] << 8 | this[t + 3]) }, c.prototype.readIntLE = function (t, e, n) { t |= 0, e |= 0, n || M(t, e, this.length); for (var r = this[t], s = 1, i = 0; ++i < e && (s *= 256);)r += this[t + i] * s; return r >= (s *= 128) && (r -= Math.pow(2, 8 * e)), r }, c.prototype.readIntBE = function (t, e, n) { t |= 0, e |= 0, n || M(t, e, this.length); for (var r = e, s = 1, i = this[t + --r]; r > 0 && (s *= 256);)i += this[t + --r] * s; return i >= (s *= 128) && (i -= Math.pow(2, 8 * e)), i }, c.prototype.readInt8 = function (t, e) { return e || M(t, 1, this.length), 128 & this[t] ? -1 * (255 - this[t] + 1) : this[t] }, c.prototype.readInt16LE = function (t, e) { e || M(t, 2, this.length); var n = this[t] | this[t + 1] << 8; return 32768 & n ? 4294901760 | n : n }, c.prototype.readInt16BE = function (t, e) { e || M(t, 2, this.length); var n = this[t + 1] | this[t] << 8; return 32768 & n ? 4294901760 | n : n }, c.prototype.readInt32LE = function (t, e) { return e || M(t, 4, this.length), this[t] | this[t + 1] << 8 | this[t + 2] << 16 | this[t + 3] << 24 }, c.prototype.readInt32BE = function (t, e) { return e || M(t, 4, this.length), this[t] << 24 | this[t + 1] << 16 | this[t + 2] << 8 | this[t + 3] }, c.prototype.readFloatLE = function (t, e) { return e || M(t, 4, this.length), s.read(this, t, !0, 23, 4) }, c.prototype.readFloatBE = function (t, e) { return e || M(t, 4, this.length), s.read(this, t, !1, 23, 4) }, c.prototype.readDoubleLE = function (t, e) { return e || M(t, 8, this.length), s.read(this, t, !0, 52, 8) }, c.prototype.readDoubleBE = function (t, e) { return e || M(t, 8, this.length), s.read(this, t, !1, 52, 8) }, c.prototype.writeUIntLE = function (t, e, n, r) { (t = +t, e |= 0, n |= 0, r) || O(this, t, e, n, Math.pow(2, 8 * n) - 1, 0); var s = 1, i = 0; for (this[e] = 255 & t; ++i < n && (s *= 256);)this[e + i] = t / s & 255; return e + n }, c.prototype.writeUIntBE = function (t, e, n, r) { (t = +t, e |= 0, n |= 0, r) || O(this, t, e, n, Math.pow(2, 8 * n) - 1, 0); var s = n - 1, i = 1; for (this[e + s] = 255 & t; --s >= 0 && (i *= 256);)this[e + s] = t / i & 255; return e + n }, c.prototype.writeUInt8 = function (t, e, n) { return t = +t, e |= 0, n || O(this, t, e, 1, 255, 0), c.TYPED_ARRAY_SUPPORT || (t = Math.floor(t)), this[e] = 255 & t, e + 1 }, c.prototype.writeUInt16LE = function (t, e, n) { return t = +t, e |= 0, n || O(this, t, e, 2, 65535, 0), c.TYPED_ARRAY_SUPPORT ? (this[e] = 255 & t, this[e + 1] = t >>> 8) : N(this, t, e, !0), e + 2 }, c.prototype.writeUInt16BE = function (t, e, n) { return t = +t, e |= 0, n || O(this, t, e, 2, 65535, 0), c.TYPED_ARRAY_SUPPORT ? (this[e] = t >>> 8, this[e + 1] = 255 & t) : N(this, t, e, !1), e + 2 }, c.prototype.writeUInt32LE = function (t, e, n) { return t = +t, e |= 0, n || O(this, t, e, 4, 4294967295, 0), c.TYPED_ARRAY_SUPPORT ? (this[e + 3] = t >>> 24, this[e + 2] = t >>> 16, this[e + 1] = t >>> 8, this[e] = 255 & t) : P(this, t, e, !0), e + 4 }, c.prototype.writeUInt32BE = function (t, e, n) { return t = +t, e |= 0, n || O(this, t, e, 4, 4294967295, 0), c.TYPED_ARRAY_SUPPORT ? (this[e] = t >>> 24, this[e + 1] = t >>> 16, this[e + 2] = t >>> 8, this[e + 3] = 255 & t) : P(this, t, e, !1), e + 4 }, c.prototype.writeIntLE = function (t, e, n, r) { if (t = +t, e |= 0, !r) { var s = Math.pow(2, 8 * n - 1); O(this, t, e, n, s - 1, -s) } var i = 0, o = 1, l = 0; for (this[e] = 255 & t; ++i < n && (o *= 256);)t < 0 && 0 === l && 0 !== this[e + i - 1] && (l = 1), this[e + i] = (t / o >> 0) - l & 255; return e + n }, c.prototype.writeIntBE = function (t, e, n, r) { if (t = +t, e |= 0, !r) { var s = Math.pow(2, 8 * n - 1); O(this, t, e, n, s - 1, -s) } var i = n - 1, o = 1, l = 0; for (this[e + i] = 255 & t; --i >= 0 && (o *= 256);)t < 0 && 0 === l && 0 !== this[e + i + 1] && (l = 1), this[e + i] = (t / o >> 0) - l & 255; return e + n }, c.prototype.writeInt8 = function (t, e, n) { return t = +t, e |= 0, n || O(this, t, e, 1, 127, -128), c.TYPED_ARRAY_SUPPORT || (t = Math.floor(t)), t < 0 && (t = 255 + t + 1), this[e] = 255 & t, e + 1 }, c.prototype.writeInt16LE = function (t, e, n) { return t = +t, e |= 0, n || O(this, t, e, 2, 32767, -32768), c.TYPED_ARRAY_SUPPORT ? (this[e] = 255 & t, this[e + 1] = t >>> 8) : N(this, t, e, !0), e + 2 }, c.prototype.writeInt16BE = function (t, e, n) { return t = +t, e |= 0, n || O(this, t, e, 2, 32767, -32768), c.TYPED_ARRAY_SUPPORT ? (this[e] = t >>> 8, this[e + 1] = 255 & t) : N(this, t, e, !1), e + 2 }, c.prototype.writeInt32LE = function (t, e, n) { return t = +t, e |= 0, n || O(this, t, e, 4, 2147483647, -2147483648), c.TYPED_ARRAY_SUPPORT ? (this[e] = 255 & t, this[e + 1] = t >>> 8, this[e + 2] = t >>> 16, this[e + 3] = t >>> 24) : P(this, t, e, !0), e + 4 }, c.prototype.writeInt32BE = function (t, e, n) { return t = +t, e |= 0, n || O(this, t, e, 4, 2147483647, -2147483648), t < 0 && (t = 4294967295 + t + 1), c.TYPED_ARRAY_SUPPORT ? (this[e] = t >>> 24, this[e + 1] = t >>> 16, this[e + 2] = t >>> 8, this[e + 3] = 255 & t) : P(this, t, e, !1), e + 4 }, c.prototype.writeFloatLE = function (t, e, n) { return D(this, t, e, !0, n) }, c.prototype.writeFloatBE = function (t, e, n) { return D(this, t, e, !1, n) }, c.prototype.writeDoubleLE = function (t, e, n) { return B(this, t, e, !0, n) }, c.prototype.writeDoubleBE = function (t, e, n) { return B(this, t, e, !1, n) }, c.prototype.copy = function (t, e, n, r) { if (n || (n = 0), r || 0 === r || (r = this.length), e >= t.length && (e = t.length), e || (e = 0), r > 0 && r < n && (r = n), r === n) return 0; if (0 === t.length || 0 === this.length) return 0; if (e < 0) throw new RangeError("targetStart out of bounds"); if (n < 0 || n >= this.length) throw new RangeError("sourceStart out of bounds"); if (r < 0) throw new RangeError("sourceEnd out of bounds"); r > this.length && (r = this.length), t.length - e < r - n && (r = t.length - e + n); var s, i = r - n; if (this === t && n < e && e < r) for (s = i - 1; s >= 0; --s)t[s + e] = this[s + n]; else if (i < 1e3 || !c.TYPED_ARRAY_SUPPORT) for (s = 0; s < i; ++s)t[s + e] = this[s + n]; else Uint8Array.prototype.set.call(t, this.subarray(n, n + i), e); return i }, c.prototype.fill = function (t, e, n, r) { if ("string" == typeof t) { if ("string" == typeof e ? (r = e, e = 0, n = this.length) : "string" == typeof n && (r = n, n = this.length), 1 === t.length) { var s = t.charCodeAt(0); s < 256 && (t = s) } if (void 0 !== r && "string" != typeof r) throw new TypeError("encoding must be a string"); if ("string" == typeof r && !c.isEncoding(r)) throw new TypeError("Unknown encoding: " + r) } else "number" == typeof t && (t &= 255); if (e < 0 || this.length < e || this.length < n) throw new RangeError("Out of range index"); if (n <= e) return this; var i; if (e >>>= 0, n = void 0 === n ? this.length : n >>> 0, t || (t = 0), "number" == typeof t) for (i = e; i < n; ++i)this[i] = t; else { var o = c.isBuffer(t) ? t : j(new c(t, r).toString()), l = o.length; for (i = 0; i < n - e; ++i)this[i + e] = o[i % l] } return this }; var L = /[^+\/0-9A-Za-z-_]/g; function Y(t) { return t < 16 ? "0" + t.toString(16) : t.toString(16) } function j(t, e) { var n; e = e || 1 / 0; for (var r = t.length, s = null, i = [], o = 0; o < r; ++o) { if ((n = t.charCodeAt(o)) > 55295 && n < 57344) { if (!s) { if (n > 56319) { (e -= 3) > -1 && i.push(239, 191, 189); continue } if (o + 1 === r) { (e -= 3) > -1 && i.push(239, 191, 189); continue } s = n; continue } if (n < 56320) { (e -= 3) > -1 && i.push(239, 191, 189), s = n; continue } n = 65536 + (s - 55296 << 10 | n - 56320) } else s && (e -= 3) > -1 && i.push(239, 191, 189); if (s = null, n < 128) { if ((e -= 1) < 0) break; i.push(n) } else if (n < 2048) { if ((e -= 2) < 0) break; i.push(n >> 6 | 192, 63 & n | 128) } else if (n < 65536) { if ((e -= 3) < 0) break; i.push(n >> 12 | 224, n >> 6 & 63 | 128, 63 & n | 128) } else { if (!(n < 1114112)) throw new Error("Invalid code point"); if ((e -= 4) < 0) break; i.push(n >> 18 | 240, n >> 12 & 63 | 128, n >> 6 & 63 | 128, 63 & n | 128) } } return i } function F(t) { return r.toByteArray(function (t) { if ((t = function (t) { return t.trim ? t.trim() : t.replace(/^\s+|\s+$/g, "") }(t).replace(L, "")).length < 2) return ""; for (; t.length % 4 != 0;)t += "="; return t }(t)) } function J(t, e, n, r) { for (var s = 0; s < r && !(s + n >= e.length || s >= t.length); ++s)e[s + n] = t[s]; return s }
    }).call(this, n(15))
}, function (t, e) { var n, r, s = t.exports = {}; function i() { throw new Error("setTimeout has not been defined") } function o() { throw new Error("clearTimeout has not been defined") } function l(t) { if (n === setTimeout) return setTimeout(t, 0); if ((n === i || !n) && setTimeout) return n = setTimeout, setTimeout(t, 0); try { return n(t, 0) } catch (e) { try { return n.call(null, t, 0) } catch (e) { return n.call(this, t, 0) } } } !function () { try { n = "function" == typeof setTimeout ? setTimeout : i } catch (t) { n = i } try { r = "function" == typeof clearTimeout ? clearTimeout : o } catch (t) { r = o } }(); var c, a = [], u = !1, h = -1; function f() { u && c && (u = !1, c.length ? a = c.concat(a) : h = -1, a.length && d()) } function d() { if (!u) { var t = l(f); u = !0; for (var e = a.length; e;) { for (c = a, a = []; ++h < e;)c && c[h].run(); h = -1, e = a.length } c = null, u = !1, function (t) { if (r === clearTimeout) return clearTimeout(t); if ((r === o || !r) && clearTimeout) return r = clearTimeout, clearTimeout(t); try { r(t) } catch (e) { try { return r.call(null, t) } catch (e) { return r.call(this, t) } } }(t) } } function g(t, e) { this.fun = t, this.array = e } function p() { } s.nextTick = function (t) { var e = new Array(arguments.length - 1); if (arguments.length > 1) for (var n = 1; n < arguments.length; n++)e[n - 1] = arguments[n]; a.push(new g(t, e)), 1 !== a.length || u || l(d) }, g.prototype.run = function () { this.fun.apply(null, this.array) }, s.title = "browser", s.browser = !0, s.env = {}, s.argv = [], s.version = "", s.versions = {}, s.on = p, s.addListener = p, s.once = p, s.off = p, s.removeListener = p, s.removeAllListeners = p, s.emit = p, s.prependListener = p, s.prependOnceListener = p, s.listeners = function (t) { return [] }, s.binding = function (t) { throw new Error("process.binding is not supported") }, s.cwd = function () { return "/" }, s.chdir = function (t) { throw new Error("process.chdir is not supported") }, s.umask = function () { return 0 } }, function (t, e, n) { "use strict"; n.d(e, "a", (function () { return s })); let r = new class { constructor() { this.map = new Map } setItem(t, e) { this.map.set(t, e) } getItem(t) { return this.map.get(t) } }; try { "undefined" != typeof localStorage && (r = localStorage) } catch (t) { } const s = r }, function (t, e) { var n; n = function () { return this }(); try { n = n || new Function("return this")() } catch (t) { "object" == typeof window && (n = window) } t.exports = n }, function (t, e, n) { "use strict"; e.byteLength = function (t) { var e = a(t), n = e[0], r = e[1]; return 3 * (n + r) / 4 - r }, e.toByteArray = function (t) { var e, n, r = a(t), o = r[0], l = r[1], c = new i(function (t, e, n) { return 3 * (e + n) / 4 - n }(0, o, l)), u = 0, h = l > 0 ? o - 4 : o; for (n = 0; n < h; n += 4)e = s[t.charCodeAt(n)] << 18 | s[t.charCodeAt(n + 1)] << 12 | s[t.charCodeAt(n + 2)] << 6 | s[t.charCodeAt(n + 3)], c[u++] = e >> 16 & 255, c[u++] = e >> 8 & 255, c[u++] = 255 & e; 2 === l && (e = s[t.charCodeAt(n)] << 2 | s[t.charCodeAt(n + 1)] >> 4, c[u++] = 255 & e); 1 === l && (e = s[t.charCodeAt(n)] << 10 | s[t.charCodeAt(n + 1)] << 4 | s[t.charCodeAt(n + 2)] >> 2, c[u++] = e >> 8 & 255, c[u++] = 255 & e); return c }, e.fromByteArray = function (t) { for (var e, n = t.length, s = n % 3, i = [], o = 0, l = n - s; o < l; o += 16383)i.push(u(t, o, o + 16383 > l ? l : o + 16383)); 1 === s ? (e = t[n - 1], i.push(r[e >> 2] + r[e << 4 & 63] + "==")) : 2 === s && (e = (t[n - 2] << 8) + t[n - 1], i.push(r[e >> 10] + r[e >> 4 & 63] + r[e << 2 & 63] + "=")); return i.join("") }; for (var r = [], s = [], i = "undefined" != typeof Uint8Array ? Uint8Array : Array, o = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", l = 0, c = o.length; l < c; ++l)r[l] = o[l], s[o.charCodeAt(l)] = l; function a(t) { var e = t.length; if (e % 4 > 0) throw new Error("Invalid string. Length must be a multiple of 4"); var n = t.indexOf("="); return -1 === n && (n = e), [n, n === e ? 0 : 4 - n % 4] } function u(t, e, n) { for (var s, i, o = [], l = e; l < n; l += 3)s = (t[l] << 16 & 16711680) + (t[l + 1] << 8 & 65280) + (255 & t[l + 2]), o.push(r[(i = s) >> 18 & 63] + r[i >> 12 & 63] + r[i >> 6 & 63] + r[63 & i]); return o.join("") } s["-".charCodeAt(0)] = 62, s["_".charCodeAt(0)] = 63 }, function (t, e) { e.read = function (t, e, n, r, s) { var i, o, l = 8 * s - r - 1, c = (1 << l) - 1, a = c >> 1, u = -7, h = n ? s - 1 : 0, f = n ? -1 : 1, d = t[e + h]; for (h += f, i = d & (1 << -u) - 1, d >>= -u, u += l; u > 0; i = 256 * i + t[e + h], h += f, u -= 8); for (o = i & (1 << -u) - 1, i >>= -u, u += r; u > 0; o = 256 * o + t[e + h], h += f, u -= 8); if (0 === i) i = 1 - a; else { if (i === c) return o ? NaN : 1 / 0 * (d ? -1 : 1); o += Math.pow(2, r), i -= a } return (d ? -1 : 1) * o * Math.pow(2, i - r) }, e.write = function (t, e, n, r, s, i) { var o, l, c, a = 8 * i - s - 1, u = (1 << a) - 1, h = u >> 1, f = 23 === s ? Math.pow(2, -24) - Math.pow(2, -77) : 0, d = r ? 0 : i - 1, g = r ? 1 : -1, p = e < 0 || 0 === e && 1 / e < 0 ? 1 : 0; for (e = Math.abs(e), isNaN(e) || e === 1 / 0 ? (l = isNaN(e) ? 1 : 0, o = u) : (o = Math.floor(Math.log(e) / Math.LN2), e * (c = Math.pow(2, -o)) < 1 && (o--, c *= 2), (e += o + h >= 1 ? f / c : f * Math.pow(2, 1 - h)) * c >= 2 && (o++, c /= 2), o + h >= u ? (l = 0, o = u) : o + h >= 1 ? (l = (e * c - 1) * Math.pow(2, s), o += h) : (l = e * Math.pow(2, h - 1) * Math.pow(2, s), o = 0)); s >= 8; t[n + d] = 255 & l, d += g, l /= 256, s -= 8); for (o = o << s | l, a += s; a > 0; t[n + d] = 255 & o, d += g, o /= 256, a -= 8); t[n + d - g] |= 128 * p } }, function (t, e) { var n = {}.toString; t.exports = Array.isArray || function (t) { return "[object Array]" == n.call(t) } }, function (t, e, n) { "use strict"; n.r(e), n.d(e, "CoCreateYSocket", (function () { return tr })); const r = t => t[t.length - 1], s = Array.from, i = Math.floor, o = (Math.ceil, Math.abs, Math.imul, Math.round, Math.log10), l = (Math.log2, Math.log, Math.sqrt, (t, e) => t < e ? t : e), c = (t, e) => t > e ? t : e; Number.isNaN, Math.pow; var a = n(0), u = n(1); Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER; const h = Number.isInteger || (t => "number" == typeof t && isFinite(t) && i(t) === t); Number.isNaN; var f = n(3); class d { constructor() { this.cpos = 0, this.cbuf = new Uint8Array(100), this.bufs = [] } } const g = () => new d, p = t => { let e = t.cpos; for (let n = 0; n < t.bufs.length; n++)e += t.bufs[n].length; return e }, w = t => { const e = new Uint8Array(p(t)); let n = 0; for (let r = 0; r < t.bufs.length; r++) { const s = t.bufs[r]; e.set(s, n), n += s.length } return e.set(u.c(t.cbuf.buffer, 0, t.cpos), n), e }, y = (t, e) => { const n = t.cbuf.length; t.cpos === n && (t.bufs.push(t.cbuf), t.cbuf = new Uint8Array(2 * n), t.cpos = 0), t.cbuf[t.cpos++] = e }, m = y, b = (t, e) => { for (; e > 127;)y(t, 128 | 127 & e), e >>>= 7; y(t, 127 & e) }, _ = (t, e) => S(t, f.b(e)), v = (t, e) => { const n = t.cbuf.length, r = t.cpos, s = l(n - r, e.length), i = e.length - s; t.cbuf.set(e.subarray(0, s), r), t.cpos += s, i > 0 && (t.bufs.push(t.cbuf), t.cbuf = new Uint8Array(c(2 * n, i)), t.cbuf.set(e.subarray(s)), t.cpos = i) }, S = (t, e) => { b(t, e.byteLength), v(t, e) }, E = (t, e) => { ((t, e) => { const n = t.cbuf.length; n - t.cpos < e && (t.bufs.push(u.c(t.cbuf.buffer, 0, t.cpos)), t.cbuf = new Uint8Array(2 * c(n, e)), t.cpos = 0) })(t, e); const n = new DataView(t.cbuf.buffer, t.cpos, e); return t.cpos += e, n }, k = new DataView(new ArrayBuffer(4)), A = (t, e) => { switch (typeof e) { case "string": y(t, 119), _(t, e); break; case "number": h(e) && e <= 2147483647 ? (y(t, 125), ((t, e) => { let n = !1; for (e < 0 && (e = -e, n = !0), y(t, (e > 63 ? 128 : 0) | (n ? 64 : 0) | 63 & e), e >>>= 6; e > 0;)y(t, (e > 127 ? 128 : 0) | 127 & e), e >>>= 7 })(t, e)) : (n = e, k.setFloat32(0, n), k.getFloat32(0) === n ? (y(t, 124), ((t, e) => { E(t, 4).setFloat32(0, e) })(t, e)) : (y(t, 123), ((t, e) => { E(t, 8).setFloat64(0, e) })(t, e))); break; case "bigint": y(t, 122), ((t, e) => { E(t, 8).setBigInt64(0, e) })(t, e); break; case "object": if (null === e) y(t, 126); else if (e instanceof Array) { y(t, 117), b(t, e.length); for (let n = 0; n < e.length; n++)A(t, e[n]) } else if (e instanceof Uint8Array) y(t, 116), S(t, e); else { y(t, 118); const n = Object.keys(e); b(t, n.length); for (let r = 0; r < n.length; r++) { const s = n[r]; _(t, s), A(t, e[s]) } } break; case "boolean": y(t, e ? 120 : 121); break; default: y(t, 127) }var n }; class C { constructor(t) { this.arr = t, this.pos = 0 } } const T = t => new C(t), R = (t, e) => { const n = u.c(t.arr.buffer, t.pos + t.arr.byteOffset, e); return t.pos += e, n }, I = t => R(t, M(t)), U = t => t.arr[t.pos++], M = t => { let e = 0, n = 0; for (; ;) { const r = t.arr[t.pos++]; if (e |= (127 & r) << n, n += 7, r < 128) return e >>> 0; if (n > 35) throw new Error("Integer out of range!") } }, O = t => { let e = t.arr[t.pos++], n = 63 & e, r = 6; const s = (64 & e) > 0 ? -1 : 1; if (0 == (128 & e)) return s * n; for (; ;) { if (e = t.arr[t.pos++], n |= (127 & e) << r, r += 7, e < 128) return s * n; if (r > 41) throw new Error("Integer out of range!") } }, N = t => f.a(I(t)), P = (t, e) => { const n = new DataView(t.arr.buffer, t.arr.byteOffset + t.pos, e); return t.pos += e, n }, x = [t => { }, t => null, O, t => P(t, 4).getFloat32(0), t => P(t, 8).getFloat64(0), t => P(t, 8).getBigInt64(0), t => !1, t => !0, N, t => { const e = M(t), n = {}; for (let r = 0; r < e; r++) { n[N(t)] = D(t) } return n }, t => { const e = M(t), n = []; for (let r = 0; r < e; r++)n.push(D(t)); return n }, I], D = t => x[127 - U(t)](t), B = () => new Set; class L { constructor() { this._observers = a.b() } on(t, e) { a.c(this._observers, t, B).add(e) } once(t, e) { this.on(t, (...n) => { this.off(t, e), e(...n) }) } off(t, e) { const n = this._observers.get(t); void 0 !== n && (n.delete(e), 0 === n.size && this._observers.delete(t)) } emit(t, e) { return s((this._observers.get(t) || a.b()).values()).forEach(t => t(...e)) } destroy() { this._observers = a.b() } } var Y = n(11), j = n.n(Y); j.a.performance; const F = j.a.cryptoRandomBuffer, J = (Math.random, () => new Uint32Array(F(4))[0]), $ = (t, e, n = 0) => { try { for (; n < t.length; n++)t[n](...e) } finally { n < t.length && $(t, e, n + 1) } }, W = t => new Error(t), z = () => { throw W("Method unimplemented") }, H = () => { throw W("Unexpected case") }, q = Date.now, V = t => ({ [Symbol.iterator]() { return this }, next: t }), G = (t, e) => V(() => { const { done: n, value: r } = t.next(); return { done: n, value: n ? void 0 : e(r) } }), X = (Object.assign, Object.keys), K = t => X(t).length, Z = (t, e) => t === e || K(t) === K(e) && ((t, e) => { for (const n in t) if (!e(t[n], n)) return !1; return !0 })(t, (t, n) => (void 0 !== t || ((t, e) => Object.prototype.hasOwnProperty.call(t, e))(e, n)) && e[n] === t); class Q { constructor(t, e) { this.clock = t, this.len = e } } class tt { constructor() { this.clients = new Map } } const et = (t, e, n) => e.clients.forEach((e, r) => { const s = t.doc.store.clients.get(r); for (let r = 0; r < e.length; r++) { const i = e[r]; qt(t, s, i.clock, i.len, n) } }), nt = (t, e) => { const n = t.clients.get(e.client); return void 0 !== n && null !== ((t, e) => { let n = 0, r = t.length - 1; for (; n <= r;) { const s = i((n + r) / 2), o = t[s], l = o.clock; if (l <= e) { if (e < l + o.len) return s; n = s + 1 } else r = s - 1 } return null })(n, e.clock) }, rt = t => { t.clients.forEach(t => { let e, n; for (t.sort((t, e) => t.clock - e.clock), e = 1, n = 1; e < t.length; e++) { const r = t[n - 1], s = t[e]; r.clock + r.len === s.clock ? r.len += s.len : (n < e && (t[n] = s), n++) } t.length = n }) }, st = (t, e, n) => { Object(a.c)(t.clients, e.client, () => []).push(new Q(e.clock, n)) }, it = () => new tt, ot = t => { const e = it(); return t.clients.forEach((t, n) => { const r = []; for (let e = 0; e < t.length; e++) { const n = t[e]; if (n.deleted) { const s = n.id.clock; let i = n.length; if (e + 1 < t.length) for (let n = t[e + 1]; e + 1 < t.length && n.id.clock === s + i && n.deleted; n = t[++e + 1])i += n.length; r.push(new Q(s, i)) } } r.length > 0 && e.clients.set(n, r) }), e }, lt = (t, e) => { b(t, e.clients.size), e.clients.forEach((e, n) => { b(t, n); const r = e.length; b(t, r); for (let n = 0; n < r; n++) { const r = e[n]; b(t, r.clock), b(t, r.len) } }) }, ct = (t, e, n) => { const r = new tt, s = M(t); for (let i = 0; i < s; i++) { const s = M(t), i = M(t), o = n.clients.get(s) || [], l = Ft(n, s); for (let n = 0; n < i; n++) { const n = M(t), i = M(t); if (n < l) { l < n + i && st(r, At(s, l), n + i - l); let t = $t(o, n), c = o[t]; for (!c.deleted && c.id.clock < n && (o.splice(t + 1, 0, an(e, c, n - c.id.clock)), t++); t < o.length && (c = o[t++], c.id.clock < n + i);)c.deleted || (n + i < c.id.clock + c.length && o.splice(t, 0, an(e, c, n + i - c.id.clock)), c.delete(e)) } else st(r, At(s, n), i) } } if (r.clients.size > 0) { const t = g(); lt(t, r), n.pendingDeleteReaders.push(T(w(t))) } }; const at = (t, e, n) => { const r = []; for (let s = 0; s < e; s++) { const e = U(t), s = 0 == (31 & e) ? new We(t, n, e) : new fn(t, n, e); n = At(n.client, n.clock + s.length), r.push(s) } return r }, ut = (t, e, n) => { const r = new Map; n.forEach((t, n) => { Ft(e, n) > t && r.set(n, t) }), jt(e).forEach((t, e) => { n.has(e) || r.set(e, 0) }), b(t, r.size), r.forEach((n, r) => { ((t, e, n, r) => { const s = $t(e, r); b(t, e.length - s), Ct(t, At(n, r)); const i = e[s]; i.write(t, r - i.id.clock, 0); for (let n = s + 1; n < e.length; n++)e[n].write(t, 0, 0) })(t, e.clients.get(r), r, n) }) }, ht = (t, e, n) => { ((t, e) => { const n = t.pendingClientsStructRefs; for (const [t, r] of e) { const e = n.get(t); if (void 0 === e) n.set(t, { refs: r, i: 0 }); else { const t = e.i > 0 ? e.refs.slice(e.i) : e.refs; for (let e = 0; e < r.length; e++)t.push(r[e]); e.i = 0, e.refs = t.sort((t, e) => t.id.clock - e.id.clock) } } })(n, (t => { const e = new Map, n = M(t); for (let r = 0; r < n; r++) { const n = M(t), r = Tt(t), s = at(t, n, r); e.set(r.client, s) } return e })(t)), ((t, e) => { const n = e.pendingStack, r = e.pendingClientsStructRefs; for (; 0 !== n.length || 0 !== r.size;) { if (0 === n.length) { const [t, e] = r.entries().next().value; n.push(e.refs[e.i++]), e.refs.length === e.i && r.delete(t) } const s = n[n.length - 1], i = s._missing, o = s.id.client, l = Ft(e, o), c = s.id.clock < l ? l - s.id.clock : 0; if (s.id.clock + c !== l) { const t = r.get(o); if (void 0 !== t) { const e = t.refs[t.i]; if (e.id.clock < s.id.clock) { t.refs[t.i] = s, n[n.length - 1] = e, t.refs = t.refs.slice(t.i).sort((t, e) => t.id.clock - e.id.clock), t.i = 0; continue } } return } for (; i.length > 0;) { const t = i[i.length - 1]; if (Ft(e, t.client) <= t.clock) { const e = t.client, s = r.get(e); if (void 0 === s) return; n.push(s.refs[s.i++]), s.i === s.refs.length && r.delete(e); break } s._missing.pop() } 0 === i.length && (c < s.length && s.toStruct(t, e, c).integrate(t), n.pop()) } })(e, n), ((t, e) => { const n = e.pendingDeleteReaders; e.pendingDeleteReaders = []; for (let r = 0; r < n.length; r++)ct(n[r], t, e) })(e, n) }, ft = (t, e, n) => ((t, e, n) => ee(e, n => { ht(t, n, e.store), ct(t, n, e.store) }, n, !1))(T(e), t, n), dt = (t, e) => { const n = g(); return ((t, e, n = new Map) => { ut(t, e.store, n), lt(t, ot(e.store)) })(n, t, null == e ? new Map : pt(e)), w(n) }, gt = t => { const e = new Map, n = M(t); for (let r = 0; r < n; r++) { const n = M(t), r = M(t); e.set(n, r) } return e }, pt = t => gt(T(t)), wt = (t, e) => (b(t, e.size), e.forEach((e, n) => { b(t, n), b(t, e) }), t), yt = t => { const e = g(); return ((t, e) => { wt(t, jt(e.store)) })(e, t), w(e) }; class mt { constructor() { this.l = [] } } const bt = () => new mt, _t = (t, e) => t.l.push(e), vt = (t, e) => { t.l = t.l.filter(t => e !== t) }, St = (t, e, n) => $(t.l, [e, n]); class Et { constructor(t, e) { this.client = t, this.clock = e } } const kt = (t, e) => t === e || null !== t && null !== e && t.client === e.client && t.clock === e.clock, At = (t, e) => new Et(t, e), Ct = (t, e) => { b(t, e.client), b(t, e.clock) }, Tt = t => At(M(t), M(t)), Rt = t => { for (const [e, n] of t.doc.share) if (n === t) return e; throw H() }; class It { constructor(t, e, n) { this.type = t, this.tname = e, this.item = n } } const Ut = t => new It(null == t.type ? null : At(t.type.client, t.type.clock), t.tname || null, null == t.item ? null : At(t.item.client, t.item.clock)); class Mt { constructor(t, e) { this.type = t, this.index = e } } const Ot = (t, e) => { let n = null, r = null; return null === t._item ? r = Rt(t) : n = t._item.id, new It(n, r, e) }, Nt = (t, e) => { let n = t._start; for (; null !== n;) { if (!n.deleted && n.countable) { if (n.length > e) return Ot(t, At(n.id.client, n.id.clock + e)); e -= n.length } n = n.right } return Ot(t, null) }, Pt = (t, e) => { const n = e.store, r = t.item, s = t.type, i = t.tname; let o = null, l = 0; if (null !== r) { if (Ft(n, r.client) <= r.clock) return null; const t = cn(n, r), e = t.item; if (!(e instanceof un)) return null; if (o = e.parent, null === o._item || !o._item.deleted) { l = e.deleted || !e.countable ? 0 : t.diff; let n = e.left; for (; null !== n;)!n.deleted && n.countable && (l += n.length), n = n.left } } else { if (null !== i) o = e.get(i); else { if (null === s) throw H(); { if (Ft(n, s.client) <= s.clock) return null; const { item: t } = cn(n, s); if (!(t instanceof un && t.content instanceof ln)) return null; o = t.content.type } } l = o._length } return ((t, e) => new Mt(t, e))(o, l) }; class xt { constructor(t, e) { this.ds = t, this.sv = e } } const Dt = (t, e) => new xt(t, e), Bt = (Dt(it(), new Map), (t, e) => void 0 === e ? !t.deleted : e.sv.has(t.id.client) && (e.sv.get(t.id.client) || 0) > t.id.clock && !nt(e.ds, t.id)), Lt = (t, e) => { const n = Object(a.c)(t.meta, Lt, B), r = t.doc.store; n.has(e) || (e.sv.forEach((e, n) => { e < Ft(r, n) && Ht(t, At(n, e)) }), et(t, e.ds, t => { }), n.add(e)) }; class Yt { constructor() { this.clients = new Map, this.pendingClientsStructRefs = new Map, this.pendingStack = [], this.pendingDeleteReaders = [] } } const jt = t => { const e = new Map; return t.clients.forEach((t, n) => { const r = t[t.length - 1]; e.set(n, r.id.clock + r.length) }), e }, Ft = (t, e) => { const n = t.clients.get(e); if (void 0 === n) return 0; const r = n[n.length - 1]; return r.id.clock + r.length }, Jt = (t, e) => { let n = t.clients.get(e.id.client); if (void 0 === n) n = [], t.clients.set(e.id.client, n); else { const t = n[n.length - 1]; if (t.id.clock + t.length !== e.id.clock) throw H() } n.push(e) }, $t = (t, e) => { let n = 0, r = t.length - 1; for (; n <= r;) { const s = i((n + r) / 2), o = t[s], l = o.id.clock; if (l <= e) { if (e < l + o.length) return s; n = s + 1 } else r = s - 1 } throw H() }, Wt = (t, e) => ((t, e) => { const n = t.clients.get(e.client); return n[$t(n, e.clock)] })(t, e), zt = (t, e, n) => { const r = $t(e, n), s = e[r]; return s.id.clock < n && s instanceof un ? (e.splice(r + 1, 0, an(t, s, n - s.id.clock)), r + 1) : r }, Ht = (t, e) => { const n = t.doc.store.clients.get(e.client); return n[zt(t, n, e.clock)] }, qt = (t, e, n, r, s) => { if (0 === r) return; const i = n + r; let o, l = zt(t, e, n); do { o = e[l++], i < o.id.clock + o.length && zt(t, e, i), s(o) } while (l < e.length && e[l].id.clock < i) }; class Vt { constructor(t, e, n) { this.doc = t, this.deleteSet = new tt, this.beforeState = jt(t.store), this.afterState = new Map, this.changed = new Map, this.changedParentTypes = new Map, this._mergeStructs = new Set, this.origin = e, this.meta = new Map, this.local = n } } const Gt = t => { if (0 === t.deleteSet.clients.size && !Object(a.a)(t.afterState, (e, n) => t.beforeState.get(n) !== e)) return null; const e = g(); return rt(t.deleteSet), ((t, e) => { ut(t, e.doc.store, e.beforeState) })(e, t), lt(e, t.deleteSet), e }, Xt = t => { const e = t.doc; return At(e.clientID, Ft(e.store, e.clientID)) }, Kt = (t, e) => { const n = t[e - 1], r = t[e]; n.deleted === r.deleted && n.constructor === r.constructor && n.mergeWith(r) && (t.splice(e, 1), r instanceof un && null !== r.parentSub && r.parent._map.get(r.parentSub) === r && r.parent._map.set(r.parentSub, n)) }, Zt = (t, e, n) => { for (const [r, s] of t.clients) { const t = e.clients.get(r); for (let r = s.length - 1; r >= 0; r--) { const i = s[r], o = i.clock + i.len; for (let r = $t(t, i.clock), s = t[r]; r < t.length && s.id.clock < o; s = t[++r]) { const s = t[r]; if (i.clock + i.len <= s.id.clock) break; s instanceof un && s.deleted && !s.keep && n(s) && s.gc(e, !1) } } } }, Qt = (t, e) => { for (const [n, r] of t.clients) { const t = e.clients.get(n); for (let e = r.length - 1; e >= 0; e--) { const n = r[e]; for (let e = l(t.length - 1, 1 + $t(t, n.clock + n.len - 1)), r = t[e]; e > 0 && r.id.clock >= n.clock; r = t[--e])Kt(t, e) } } }, te = (t, e) => { if (e < t.length) { const n = t[e], r = n.doc, s = r.store, i = n.deleteSet; try { rt(i), n.afterState = jt(n.doc.store), r._transaction = null, r.emit("beforeObserverCalls", [n, r]); const o = []; n.changed.forEach((t, e) => o.push(() => { null !== e._item && e._item.deleted || e._callObserver(n, t) })), o.push(() => { n.changedParentTypes.forEach((t, e) => o.push(() => { null !== e._item && e._item.deleted || ((t = t.filter(t => null === t.target._item || !t.target._item.deleted)).forEach(t => { t.currentTarget = e }), St(e._dEH, t, n)) })), o.push(() => r.emit("afterTransaction", [n, r])) }), $(o, []) } finally { r.gc && Zt(i, s, r.gcFilter), Qt(i, s); for (const [t, e] of n.afterState) { const r = n.beforeState.get(t) || 0; if (r !== e) { const e = s.clients.get(t), n = c($t(e, r), 1); for (let t = e.length - 1; t >= n; t--)Kt(e, t) } } for (const t of n._mergeStructs) { const e = t.client, n = t.clock, r = s.clients.get(e), i = $t(r, n); i + 1 < r.length && Kt(r, i + 1), i > 0 && Kt(r, i) } if (r.emit("afterTransactionCleanup", [n, r]), r._observers.has("update")) { const t = Gt(n); null !== t && r.emit("update", [w(t), n.origin, r]) } t.length <= e + 1 ? r._transactionCleanups = [] : te(t, e + 1) } } }, ee = (t, e, n = null, r = !0) => { const s = t._transactionCleanups; let i = !1; null === t._transaction && (i = !0, t._transaction = new Vt(t, n, r), s.push(t._transaction), t.emit("beforeTransaction", [t._transaction, t])); try { e(t._transaction) } finally { i && s[0] === t._transaction && te(s, 0) } }; class ne { constructor(t, e) { this.target = t, this.currentTarget = t, this.transaction = e, this._changes = null } get path() { return re(this.currentTarget, this.target) } deletes(t) { return nt(this.transaction.deleteSet, t.id) } adds(t) { return t.id.clock >= (this.transaction.beforeState.get(t.id.client) || 0) } get changes() { let t = this._changes; if (null === t) { const e = this.target, n = B(), s = B(), i = [], o = new Map; t = { added: n, deleted: s, delta: i, keys: o }; const l = this.transaction.changed.get(e); if (l.has(null)) { let t = null; const r = () => { t && i.push(t) }; for (let i = e._start; null !== i; i = i.right)i.deleted ? this.deletes(i) && !this.adds(i) && (null !== t && void 0 !== t.delete || (r(), t = { delete: 0 }), t.delete += i.length, s.add(i)) : this.adds(i) ? (null !== t && void 0 !== t.insert || (r(), t = { insert: [] }), t.insert = t.insert.concat(i.content.getContent()), n.add(i)) : (null !== t && void 0 !== t.retain || (r(), t = { retain: 0 }), t.retain += i.length); null !== t && void 0 === t.retain && r() } l.forEach(t => { if (null !== t) { const n = e._map.get(t); let s, i; if (this.adds(n)) { let t = n.left; for (; null !== t && this.adds(t);)t = t.left; if (this.deletes(n)) { if (null === t || !this.deletes(t)) return; s = "delete", i = r(t.content.getContent()) } else null !== t && this.deletes(t) ? (s = "update", i = r(t.content.getContent())) : (s = "add", i = void 0) } else { if (!this.deletes(n)) return; s = "delete", i = r(n.content.getContent()) } o.set(t, { action: s, oldValue: i }) } }), this._changes = t } return (t) } } const re = (t, e) => { const n = []; for (; null !== e._item && e !== t;) { if (null !== e._item.parentSub) n.unshift(e._item.parentSub); else { let t = 0, r = e._item.parent._start; for (; r !== e._item && null !== r;)r.deleted || t++, r = r.right; n.unshift(t) } e = e._item.parent } return n }, se = (t, e, n) => { const r = t, s = e.changedParentTypes; for (; Object(a.c)(s, t, () => []).push(n), null !== t._item;)t = t._item.parent; St(r._eH, n, e) }; class ie { constructor() { this._item = null, this._map = new Map, this._start = null, this.doc = null, this._length = 0, this._eH = bt(), this._dEH = bt() } _integrate(t, e) { this.doc = t, this._item = e } _copy() { throw z() } _write(t) { } get _first() { let t = this._start; for (; null !== t && t.deleted;)t = t.right; return t } _callObserver(t, e) { } observe(t) { _t(this._eH, t) } observeDeep(t) { _t(this._dEH, t) } unobserve(t) { vt(this._eH, t) } unobserveDeep(t) { vt(this._dEH, t) } toJSON() { } } const oe = t => { const e = []; let n = t._start; for (; null !== n;) { if (n.countable && !n.deleted) { const t = n.content.getContent(); for (let n = 0; n < t.length; n++)e.push(t[n]) } n = n.right } return e }, le = (t, e) => { let n = 0, r = t._start; for (; null !== r;) { if (r.countable && !r.deleted) { const s = r.content.getContent(); for (let r = 0; r < s.length; r++)e(s[r], n++, t) } r = r.right } }, ce = (t, e) => { const n = []; return le(t, (r, s) => { n.push(e(r, s, t)) }), n }, ae = t => { let e = t._start, n = null, r = 0; return { [Symbol.iterator]() { return this }, next: () => { if (null === n) { for (; null !== e && e.deleted;)e = e.right; if (null === e) return { done: !0, value: void 0 }; n = e.content.getContent(), r = 0, e = e.right } const t = n[r++]; return n.length <= r && (n = null), { done: !1, value: t } } } }, ue = (t, e, n, r) => { let s = n; const i = null === n ? e._start : n.right; let o = []; const l = () => { o.length > 0 && (s = new un(Xt(t), s, null === s ? null : s.lastId, i, null === i ? null : i.id, e, null, new Xe(o)), s.integrate(t), o = []) }; r.forEach(n => { switch (n.constructor) { case Number: case Object: case Boolean: case Array: case String: o.push(n); break; default: switch (l(), n.constructor) { case Uint8Array: case ArrayBuffer: s = new un(Xt(t), s, null === s ? null : s.lastId, i, null === i ? null : i.id, e, null, new ze(new Uint8Array(n))), s.integrate(t); break; default: if (!(n instanceof ie)) throw new Error("Unexpected content type in insert operation"); s = new un(Xt(t), s, null === s ? null : s.lastId, i, null === i ? null : i.id, e, null, new ln(n)), s.integrate(t) } } }), l() }, he = (t, e, n, r) => { if (0 === n) return ue(t, e, null, r); let s = e._start; for (; null !== s; s = s.right)if (!s.deleted && s.countable) { if (n <= s.length) { n < s.length && Ht(t, At(s.id.client, s.id.clock + n)); break } n -= s.length } return ue(t, e, s, r) }, fe = (t, e, n, r) => { if (0 === r) return; let s = e._start; for (; null !== s && n > 0; s = s.right)!s.deleted && s.countable && (n < s.length && Ht(t, At(s.id.client, s.id.clock + n)), n -= s.length); for (; r > 0 && null !== s;)s.deleted || (r < s.length && Ht(t, At(s.id.client, s.id.clock + r)), s.delete(t), r -= s.length), s = s.right; if (r > 0) throw W("array length exceeded") }, de = (t, e, n) => { const r = e._map.get(n); void 0 !== r && r.delete(t) }, ge = (t, e, n, r) => { const s = e._map.get(n) || null; let i; if (null == r) i = new Xe([r]); else switch (r.constructor) { case Number: case Object: case Boolean: case Array: case String: i = new Xe([r]); break; case Uint8Array: i = new ze(r); break; default: if (!(r instanceof ie)) throw new Error("Unexpected content type"); i = new ln(r) }new un(Xt(t), s, null === s ? null : s.lastId, null, null, e, n, i).integrate(t) }, pe = (t, e) => { const n = t._map.get(e); return void 0 === n || n.deleted ? void 0 : n.content.getContent()[n.length - 1] }, we = t => { return e = t.entries(), n = t => !t[1].deleted, V(() => { let t; do { t = e.next() } while (!t.done && !n(t.value)); return t }); var e, n }; class ye extends ne { constructor(t, e) { super(t, e), this._transaction = e } } class me extends ie { constructor() { super(), this._prelimContent = [] } _integrate(t, e) { super._integrate(t, e), this.insert(0, this._prelimContent), this._prelimContent = null } _copy() { return new me } get length() { return null === this._prelimContent ? this._length : this._prelimContent.length } _callObserver(t, e) { se(this, t, new ye(this, t)) } insert(t, e) { null !== this.doc ? ee(this.doc, n => { he(n, this, t, e) }) : this._prelimContent.splice(t, 0, ...e) } push(t) { this.insert(this.length, t) } delete(t, e = 1) { null !== this.doc ? ee(this.doc, n => { fe(n, this, t, e) }) : this._prelimContent.splice(t, e) } get(t) { return ((t, e) => { for (let n = t._start; null !== n; n = n.right)if (!n.deleted && n.countable) { if (e < n.length) return n.content.getContent()[e]; e -= n.length } })(this, t) } toArray() { return oe(this) } toJSON() { return this.map(t => t instanceof ie ? t.toJSON() : t) } map(t) { return ce(this, t) } forEach(t) { le(this, t) } [Symbol.iterator]() { return ae(this) } _write(t) { b(t, Qe) } } class be extends ne { constructor(t, e, n) { super(t, e), this.keysChanged = n } } class _e extends ie { constructor() { super(), this._prelimContent = new Map } _integrate(t, e) { super._integrate(t, e); for (const [t, e] of this._prelimContent) this.set(t, e); this._prelimContent = null } _copy() { return new _e } _callObserver(t, e) { se(this, t, new be(this, t, e)) } toJSON() { const t = {}; for (const [e, n] of this._map) if (!n.deleted) { const r = n.content.getContent()[n.length - 1]; t[e] = r instanceof ie ? r.toJSON() : r } return t } keys() { return G(we(this._map), t => t[0]) } values() { return G(we(this._map), t => t[1].content.getContent()[t[1].length - 1]) } entries() { return G(we(this._map), t => [t[0], t[1].content.getContent()[t[1].length - 1]]) } forEach(t) { for (const [e, n] of this._map) n.deleted || t(n.content.getContent()[n.length - 1], e, this); return {} } [Symbol.iterator]() { return this.entries() } delete(t) { null !== this.doc ? ee(this.doc, e => { de(e, this, t) }) : this._prelimContent.delete(t) } set(t, e) { return null !== this.doc ? ee(this.doc, n => { ge(n, this, t, e) }) : this._prelimContent.set(t, e), e } get(t) { return pe(this, t) } has(t) { return ((t, e) => { const n = t._map.get(e); return void 0 !== n && !n.deleted })(this, t) } _write(t) { b(t, tn) } } const ve = (t, e) => t === e || "object" == typeof t && "object" == typeof e && t && e && Z(t, e); class Se { constructor(t, e) { this.left = t, this.right = e } } class Ee extends Se { constructor(t, e, n) { super(t, e), this.currentAttributes = n } } class ke extends Se { constructor(t, e, n) { super(t, e), this.negatedAttributes = n } } const Ae = (t, e, n) => ((t, e, n, r, s) => { for (; null !== r && s > 0;) { switch (r.content.constructor) { case qe: case Ke: r.deleted || (s < r.length && Ht(t, At(r.id.client, r.id.clock + s)), s -= r.length); break; case Ve: r.deleted || Te(e, r.content) }n = r, r = r.right } return new Ee(n, r, e) })(t, new Map, null, e._start, n), Ce = (t, e, n, r, s) => { for (; null !== r && (!0 === r.deleted || r.content.constructor === Ve && ve(s.get(r.content.key), r.content.value));)r.deleted || s.delete(r.content.key), n = r, r = r.right; for (const [i, o] of s) (n = new un(Xt(t), n, null === n ? null : n.lastId, r, null === r ? null : r.id, e, null, new Ve(i, o))).integrate(t); return { left: n, right: r } }, Te = (t, e) => { const { key: n, value: r } = e; null === r ? t.delete(n) : t.set(n, r) }, Re = (t, e, n, r) => { for (; null !== e;) { if (e.deleted); else { if (e.content.constructor !== Ve || !ve(r[e.content.key] || null, e.content.value)) break; Te(n, e.content) } t = e, e = e.right } return new Se(t, e) }, Ie = (t, e, n, r, s, i) => { const o = new Map; for (const l in i) { const c = i[l], a = s.get(l) || null; ve(a, c) || (o.set(l, a), (n = new un(Xt(t), n, null === n ? null : n.lastId, r, null === r ? null : r.id, e, null, new Ve(l, c))).integrate(t)) } return new ke(n, r, o) }, Ue = (t, e, n, r, s, i, o) => { for (const [t] of s) void 0 === o[t] && (o[t] = null); const l = Re(n, r, s, o), c = Ie(t, e, l.left, l.right, s, o); n = c.left, r = c.right; const a = i.constructor === String ? new Ke(i) : new qe(i); return (n = new un(Xt(t), n, null === n ? null : n.lastId, r, null === r ? null : r.id, e, null, a)).integrate(t), Ce(t, e, n, c.right, c.negatedAttributes) }, Me = (t, e, n, r, s, i, o) => { const l = Re(n, r, s, o), c = Ie(t, e, l.left, l.right, s, o), a = c.negatedAttributes; for (n = c.left, r = c.right; i > 0 && null !== r;) { if (!r.deleted) switch (r.content.constructor) { case Ve: { const { key: e, value: n } = r.content, i = o[e]; void 0 !== i && (ve(i, n) ? a.delete(e) : a.set(e, n), r.delete(t)), Te(s, r.content); break } case qe: case Ke: i < r.length && Ht(t, At(r.id.client, r.id.clock + i)), i -= r.length }n = r, r = r.right } if (i > 0) { let s = ""; for (; i > 0; i--)s += "\n"; (n = new un(Xt(t), n, null === n ? null : n.lastId, r, null === r ? null : r.id, e, null, new Ke(s))).integrate(t) } return Ce(t, e, n, r, a) }, Oe = (t, e, n, r, s) => { for (; s > 0 && null !== n;) { if (!1 === n.deleted) switch (n.content.constructor) { case Ve: Te(r, n.content); break; case qe: case Ke: s < n.length && Ht(t, At(n.id.client, n.id.clock + s)), s -= n.length, n.delete(t) }e = n, n = n.right } return { left: e, right: n } }; class Ne extends ne { constructor(t, e) { super(t, e), this._delta = null } get delta() { if (null === this._delta) { const t = this.target.doc; this._delta = [], ee(t, t => { const e = this._delta, n = new Map, r = new Map; let s = this.target._start, i = null; const o = {}; let l = "", c = 0, a = 0; const u = () => { if (null !== i) { let t; switch (i) { case "delete": t = { delete: a }, a = 0; break; case "insert": if (t = { insert: l }, n.size > 0) { t.attributes = {}; for (const [e, r] of n) null !== r && (t.attributes[e] = r) } l = ""; break; case "retain": if (t = { retain: c }, Object.keys(o).length > 0) { t.attributes = {}; for (const e in o) t.attributes[e] = o[e] } c = 0 }e.push(t), i = null } }; for (; null !== s;) { switch (s.content.constructor) { case qe: this.adds(s) ? this.deletes(s) || (u(), i = "insert", l = s.content.embed, u()) : this.deletes(s) ? ("delete" !== i && (u(), i = "delete"), a += 1) : s.deleted || ("retain" !== i && (u(), i = "retain"), c += 1); break; case Ke: this.adds(s) ? this.deletes(s) || ("insert" !== i && (u(), i = "insert"), l += s.content.str) : this.deletes(s) ? ("delete" !== i && (u(), i = "delete"), a += s.length) : s.deleted || ("retain" !== i && (u(), i = "retain"), c += s.length); break; case Ve: { const { key: e, value: l } = s.content; if (this.adds(s)) { if (!this.deletes(s)) { const c = n.get(e) || null; ve(c, l) ? s.delete(t) : ("retain" === i && u(), ve(l, r.get(e) || null) ? delete o[e] : o[e] = l) } } else if (this.deletes(s)) { r.set(e, l); const t = n.get(e) || null; ve(t, l) || ("retain" === i && u(), o[e] = t) } else if (!s.deleted) { r.set(e, l); const n = o[e]; void 0 !== n && (ve(n, l) ? s.delete(t) : ("retain" === i && u(), null === l ? o[e] = l : delete o[e])) } s.deleted || ("insert" === i && u(), Te(n, s.content)); break } }s = s.right } for (u(); e.length > 0;) { const t = e[e.length - 1]; if (void 0 === t.retain || void 0 !== t.attributes) break; e.pop() } }) } return this._delta } } class Pe extends ie { constructor(t) { super(), this._pending = void 0 !== t ? [() => this.insert(0, t)] : [] } get length() { return this._length } _integrate(t, e) { super._integrate(t, e); try { this._pending.forEach(t => t()) } catch (t) { console.error(t) } this._pending = null } _copy() { return new Pe } _callObserver(t, e) { se(this, t, new Ne(this, t)) } toString() { let t = "", e = this._start; for (; null !== e;)!e.deleted && e.countable && e.content.constructor === Ke && (t += e.content.str), e = e.right; return t } toJSON() { return this.toString() } applyDelta(t) { null !== this.doc ? ee(this.doc, e => { let n = new Se(null, this._start); const r = new Map; for (let s = 0; s < t.length; s++) { const i = t[s]; if (void 0 !== i.insert) { const o = "string" == typeof i.insert && s === t.length - 1 && null === n.right && "\n" === i.insert.slice(-1) ? i.insert.slice(0, -1) : i.insert; ("string" != typeof o || o.length > 0) && (n = Ue(e, this, n.left, n.right, r, o, i.attributes || {})) } else void 0 !== i.retain ? n = Me(e, this, n.left, n.right, r, i.retain, i.attributes || {}) : void 0 !== i.delete && (n = Oe(e, n.left, n.right, r, i.delete)) } }) : this._pending.push(() => this.applyDelta(t)) } toDelta(t, e, n) { const r = [], s = new Map, i = this.doc; let o = "", l = this._start; function c() { if (o.length > 0) { const t = {}; let e = !1; for (const [n, r] of s) e = !0, t[n] = r; const n = { insert: o }; e && (n.attributes = t), r.push(n), o = "" } } return ee(i, i => { for (t && Lt(i, t), e && Lt(i, e); null !== l;) { if (Bt(l, t) || void 0 !== e && Bt(l, e)) switch (l.content.constructor) { case Ke: { const r = s.get("ychange"); void 0 === t || Bt(l, t) ? void 0 === e || Bt(l, e) ? void 0 !== r && (c(), s.delete("ychange")) : void 0 !== r && r.user === l.id.client && "added" === r.state || (c(), s.set("ychange", n ? n("added", l.id) : { type: "added" })) : void 0 !== r && r.user === l.id.client && "removed" === r.state || (c(), s.set("ychange", n ? n("removed", l.id) : { type: "removed" })), o += l.content.str; break } case qe: c(), r.push({ insert: l.content.embed }); break; case Ve: Bt(l, t) && (c(), Te(s, l.content)) }l = l.right } c() }, Lt), r } insert(t, e, n) { if (e.length <= 0) return; const r = this.doc; null !== r ? ee(r, r => { const { left: s, right: i, currentAttributes: o } = Ae(r, this, t); n || (n = {}, o.forEach((t, e) => { n[e] = t })), Ue(r, this, s, i, o, e, n) }) : this._pending.push(() => this.insert(t, e, n)) } insertEmbed(t, e, n = {}) { if (e.constructor !== Object) throw new Error("Embed must be an Object"); const r = this.doc; null !== r ? ee(r, r => { const { left: s, right: i, currentAttributes: o } = Ae(r, this, t); Ue(r, this, s, i, o, e, n) }) : this._pending.push(() => this.insertEmbed(t, e, n)) } delete(t, e) { if (0 === e) return; const n = this.doc; null !== n ? ee(n, n => { const { left: r, right: s, currentAttributes: i } = Ae(n, this, t); Oe(n, r, s, i, e) }) : this._pending.push(() => this.delete(t, e)) } format(t, e, n) { const r = this.doc; null !== r ? ee(r, r => { const { left: s, right: i, currentAttributes: o } = Ae(r, this, t); null !== i && Me(r, this, s, i, o, e, n) }) : this._pending.push(() => this.format(t, e, n)) } _write(t) { b(t, en) } } class xe { constructor(t, e = (() => !0)) { this._filter = e, this._root = t, this._currentNode = t._start, this._firstCall = !0 } [Symbol.iterator]() { return this } next() { let t = this._currentNode, e = t.content.type; if (null !== t && (!this._firstCall || t.deleted || !this._filter(e))) do { if (e = t.content.type, t.deleted || e.constructor !== Be && e.constructor !== De || null === e._start) for (; null !== t;) { if (null !== t.right) { t = t.right; break } t = t.parent === this._root ? null : t.parent._item } else t = e._start } while (null !== t && (t.deleted || !this._filter(t.content.type))); return this._firstCall = !1, null === t ? { value: void 0, done: !0 } : (this._currentNode = t, { value: t.content.type, done: !1 }) } } class De extends ie { constructor() { super(), this._prelimContent = [] } _integrate(t, e) { super._integrate(t, e), this.insert(0, this._prelimContent), this._prelimContent = null } _copy() { return new De } get length() { return null === this._prelimContent ? this._length : this._prelimContent.length } createTreeWalker(t) { return new xe(this, t) } querySelector(t) { t = t.toUpperCase(); const e = new xe(this, e => e.nodeName && e.nodeName.toUpperCase() === t).next(); return e.done ? null : e.value } querySelectorAll(t) { return t = t.toUpperCase(), Array.from(new xe(this, e => e.nodeName && e.nodeName.toUpperCase() === t)) } _callObserver(t, e) { se(this, t, new Le(this, e, t)) } toString() { return ce(this, t => t.toString()).join("") } toJSON() { return this.toString() } toDOM(t = document, e = {}, n) { const r = t.createDocumentFragment(); return void 0 !== n && n._createAssociation(r, this), le(this, s => { r.insertBefore(s.toDOM(t, e, n), null) }), r } insert(t, e) { null !== this.doc ? ee(this.doc, n => { he(n, this, t, e) }) : this._prelimContent.splice(t, 0, ...e) } delete(t, e = 1) { null !== this.doc ? ee(this.doc, n => { fe(n, this, t, e) }) : this._prelimContent.splice(t, e) } toArray() { return oe(this) } _write(t) { b(t, rn) } } class Be extends De { constructor(t = "UNDEFINED") { super(), this.nodeName = t, this._prelimAttrs = new Map } _integrate(t, e) { super._integrate(t, e), this._prelimAttrs.forEach((t, e) => { this.setAttribute(e, t) }), this._prelimAttrs = null } _copy() { return new Be(this.nodeName) } toString() { const t = this.getAttributes(), e = [], n = []; for (const e in t) n.push(e); n.sort(); const r = n.length; for (let s = 0; s < r; s++) { const r = n[s]; e.push(r + '="' + t[r] + '"') } const s = this.nodeName.toLocaleLowerCase(); return `<${s}${e.length > 0 ? " " + e.join(" ") : ""}>${super.toString()}</${s}>` } removeAttribute(t) { null !== this.doc ? ee(this.doc, e => { de(e, this, t) }) : this._prelimAttrs.delete(t) } setAttribute(t, e) { null !== this.doc ? ee(this.doc, n => { ge(n, this, t, e) }) : this._prelimAttrs.set(t, e) } getAttribute(t) { return pe(this, t) } getAttributes(t) { return (t => { const e = {}; for (const [n, r] of t._map) r.deleted || (e[n] = r.content.getContent()[r.length - 1]); return e })(this) } toDOM(t = document, e = {}, n) { const r = t.createElement(this.nodeName), s = this.getAttributes(); for (const t in s) r.setAttribute(t, s[t]); return le(this, s => { r.appendChild(s.toDOM(t, e, n)) }), void 0 !== n && n._createAssociation(r, this), r } _write(t) { b(t, nn), _(t, this.nodeName) } } class Le extends ne { constructor(t, e, n) { super(t, n), this.childListChanged = !1, this.attributesChanged = new Set, e.forEach(t => { null === t ? this.childListChanged = !0 : this.attributesChanged.add(t) }) } } class Ye extends _e { constructor(t) { super(), this.hookName = t } _copy() { return new Ye(this.hookName) } toDOM(t = document, e = {}, n) { const r = e[this.hookName]; let s; return s = void 0 !== r ? r.createDom(this) : document.createElement(this.hookName), s.setAttribute("data-yjs-hook", this.hookName), void 0 !== n && n._createAssociation(s, this), s } _write(t) { super._write(t), b(t, sn), _(t, this.hookName) } } class je extends Pe { _copy() { return new je } toDOM(t = document, e, n) { const r = t.createTextNode(this.toString()); return void 0 !== n && n._createAssociation(r, this), r } toString() { return this.toDelta().map(t => { const e = []; for (const n in t.attributes) { const r = []; for (const e in t.attributes[n]) r.push({ key: e, value: t.attributes[n][e] }); r.sort((t, e) => t.key < e.key ? -1 : 1), e.push({ nodeName: n, attrs: r }) } e.sort((t, e) => t.nodeName < e.nodeName ? -1 : 1); let n = ""; for (let t = 0; t < e.length; t++) { const r = e[t]; n += `<${r.nodeName}`; for (let t = 0; t < r.attrs.length; t++) { const e = r.attrs[t]; n += ` ${e.key}="${e.value}"` } n += ">" } n += t.insert; for (let t = e.length - 1; t >= 0; t--)n += `</${e[t].nodeName}>`; return n }).join("") } toJSON() { return this.toString() } _write(t) { b(t, on) } } class Fe { constructor(t, e) { this.id = t, this.length = e, this.deleted = !1 } mergeWith(t) { return !1 } write(t, e, n) { throw z() } integrate(t) { throw z() } } class Je { constructor(t) { this._missing = [], this.id = t } getMissing(t) { return this._missing } toStruct(t, e, n) { throw z() } } class $e extends Fe { constructor(t, e) { super(t, e), this.deleted = !0 } delete() { } mergeWith(t) { return this.length += t.length, !0 } integrate(t) { Jt(t.doc.store, this) } write(t, e) { m(t, 0), b(t, this.length - e) } } class We extends Je { constructor(t, e, n) { super(e), this.length = M(t) } toStruct(t, e, n) { return n > 0 && (this.id = At(this.id.client, this.id.clock + n), this.length -= n), new $e(this.id, this.length) } } class ze { constructor(t) { this.content = t } getLength() { return 1 } getContent() { return [this.content] } isCountable() { return !0 } copy() { return new ze(this.content) } splice(t) { throw z() } mergeWith(t) { return !1 } integrate(t, e) { } delete(t) { } gc(t) { } write(t, e) { S(t, this.content) } getRef() { return 3 } } class He { constructor(t) { this.len = t } getLength() { return this.len } getContent() { return [] } isCountable() { return !1 } copy() { return new He(this.len) } splice(t) { const e = new He(this.len - t); return this.len = t, e } mergeWith(t) { return this.len += t.len, !0 } integrate(t, e) { st(t.deleteSet, e.id, this.len), e.deleted = !0 } delete(t) { } gc(t) { } write(t, e) { b(t, this.len - e) } getRef() { return 1 } } class qe { constructor(t) { this.embed = t } getLength() { return 1 } getContent() { return [this.embed] } isCountable() { return !0 } copy() { return new qe(this.embed) } splice(t) { throw z() } mergeWith(t) { return !1 } integrate(t, e) { } delete(t) { } gc(t) { } write(t, e) { _(t, JSON.stringify(this.embed)) } getRef() { return 5 } } class Ve { constructor(t, e) { this.key = t, this.value = e } getLength() { return 1 } getContent() { return [] } isCountable() { return !1 } copy() { return new Ve(this.key, this.value) } splice(t) { throw z() } mergeWith(t) { return !1 } integrate(t, e) { } delete(t) { } gc(t) { } write(t, e) { _(t, this.key), _(t, JSON.stringify(this.value)) } getRef() { return 6 } } class Ge { constructor(t) { this.arr = t } getLength() { return this.arr.length } getContent() { return this.arr } isCountable() { return !0 } copy() { return new Ge(this.arr) } splice(t) { const e = new Ge(this.arr.slice(t)); return this.arr = this.arr.slice(0, t), e } mergeWith(t) { return this.arr = this.arr.concat(t.arr), !0 } integrate(t, e) { } delete(t) { } gc(t) { } write(t, e) { const n = this.arr.length; b(t, n - e); for (let r = e; r < n; r++) { const e = this.arr[r]; _(t, void 0 === e ? "undefined" : JSON.stringify(e)) } } getRef() { return 2 } } class Xe { constructor(t) { this.arr = t } getLength() { return this.arr.length } getContent() { return this.arr } isCountable() { return !0 } copy() { return new Xe(this.arr) } splice(t) { const e = new Xe(this.arr.slice(t)); return this.arr = this.arr.slice(0, t), e } mergeWith(t) { return this.arr = this.arr.concat(t.arr), !0 } integrate(t, e) { } delete(t) { } gc(t) { } write(t, e) { const n = this.arr.length; b(t, n - e); for (let r = e; r < n; r++) { const e = this.arr[r]; A(t, e) } } getRef() { return 8 } } class Ke { constructor(t) { this.str = t } getLength() { return this.str.length } getContent() { return this.str.split("") } isCountable() { return !0 } copy() { return new Ke(this.str) } splice(t) { const e = new Ke(this.str.slice(t)); return this.str = this.str.slice(0, t), e } mergeWith(t) { return this.str += t.str, !0 } integrate(t, e) { } delete(t) { } gc(t) { } write(t, e) { _(t, 0 === e ? this.str : this.str.slice(e)) } getRef() { return 4 } } const Ze = [t => new me, t => new _e, t => new Pe, t => new Be(N(t)), t => new De, t => new Ye(N(t)), t => new je], Qe = 0, tn = 1, en = 2, nn = 3, rn = 4, sn = 5, on = 6; class ln { constructor(t) { this.type = t } getLength() { return 1 } getContent() { return [this.type] } isCountable() { return !0 } copy() { return new ln(this.type._copy()) } splice(t) { throw z() } mergeWith(t) { return !1 } integrate(t, e) { this.type._integrate(t.doc, e) } delete(t) { let e = this.type._start; for (; null !== e;)e.deleted ? t._mergeStructs.add(e.id) : e.delete(t), e = e.right; this.type._map.forEach(e => { e.deleted ? t._mergeStructs.add(e.id) : e.delete(t) }), t.changed.delete(this.type) } gc(t) { let e = this.type._start; for (; null !== e;)e.gc(t, !0), e = e.right; this.type._start = null, this.type._map.forEach(e => { for (; null !== e;)e.gc(t, !0), e = e.left }), this.type._map = new Map } write(t, e) { this.type._write(t) } getRef() { return 7 } } const cn = (t, e) => { let n, r = e, s = 0; do { s > 0 && (r = At(r.client, r.clock + s)), n = Wt(t, r), s = r.clock - n.id.clock, r = n.redone } while (null !== r && n instanceof un); return { item: n, diff: s } }, an = (t, e, n) => { const r = e.id, s = new un(At(r.client, r.clock + n), e, At(r.client, r.clock + n - 1), e.right, e.rightOrigin, e.parent, e.parentSub, e.content.splice(n)); return e.deleted && (s.deleted = !0), e.keep && (s.keep = !0), null !== e.redone && (s.redone = At(e.redone.client, e.redone.clock + n)), e.right = s, null !== s.right && (s.right.left = s), t._mergeStructs.add(s.id), null !== s.parentSub && null === s.right && s.parent._map.set(s.parentSub, s), e.length = n, s }; class un extends Fe { constructor(t, e, n, r, s, i, o, l) { super(t, l.getLength()), this.origin = n, this.left = e, this.right = r, this.rightOrigin = s, this.parent = i, this.parentSub = o, this.deleted = !1, this.redone = null, this.content = l, this.length = l.getLength(), this.countable = l.isCountable(), this.keep = !1 } integrate(t) { const e = t.doc.store, n = this.id, r = this.parent, s = this.parentSub, i = this.length; let o; if (null !== this.left) o = this.left.right; else if (null !== s) for (o = r._map.get(s) || null; null !== o && null !== o.left;)o = o.left; else o = r._start; const l = new Set, c = new Set; for (; null !== o && o !== this.right;) { if (c.add(o), l.add(o), kt(this.origin, o.origin)) o.id.client < n.client && (this.left = o, l.clear()); else { if (null === o.origin || !c.has(Wt(e, o.origin))) break; null !== o.origin && l.has(Wt(e, o.origin)) || (this.left = o, l.clear()) } o = o.right } if (null !== this.left) { const t = this.left.right; this.right = t, this.left.right = this } else { let t; if (null !== s) for (t = r._map.get(s) || null; null !== t && null !== t.left;)t = t.left; else t = r._start, r._start = this; this.right = t } null !== this.right ? this.right.left = this : null !== s && (r._map.set(s, this), null !== this.left && this.left.delete(t)), null === s && this.countable && !this.deleted && (r._length += i), Jt(e, this), this.content.integrate(t, this), ((t, e, n) => { const r = e._item; (null === r || r.id.clock < (t.beforeState.get(r.id.client) || 0) && !r.deleted) && Object(a.c)(t.changed, e, B).add(n) })(t, r, s), (null !== r._item && r._item.deleted || null !== this.right && null !== s) && this.delete(t) } get next() { let t = this.right; for (; null !== t && t.deleted;)t = t.right; return t } get prev() { let t = this.left; for (; null !== t && t.deleted;)t = t.left; return t } get lastId() { return At(this.id.client, this.id.clock + this.length - 1) } mergeWith(t) { return !!(kt(t.origin, this.lastId) && this.right === t && kt(this.rightOrigin, t.rightOrigin) && this.id.client === t.id.client && this.id.clock + this.length === t.id.clock && this.deleted === t.deleted && null === this.redone && null === t.redone && this.content.constructor === t.content.constructor && this.content.mergeWith(t.content)) && (t.keep && (this.keep = !0), this.right = t.right, null !== this.right && (this.right.left = this), this.length += t.length, !0) } delete(t) { if (!this.deleted) { const e = this.parent; this.countable && null === this.parentSub && (e._length -= this.length), this.deleted = !0, st(t.deleteSet, this.id, this.length), Object(a.c)(t.changed, e, B).add(this.parentSub), this.content.delete(t) } } gc(t, e) { if (!this.deleted) throw H(); this.content.gc(t), e ? ((t, e, n) => { const r = t.clients.get(e.id.client); r[$t(r, e.id.clock)] = n })(t, this, new $e(this.id, this.length)) : this.content = new He(this.length) } write(t, e) { const n = e > 0 ? At(this.id.client, this.id.clock + e - 1) : this.origin, r = this.rightOrigin, s = this.parentSub, i = 31 & this.content.getRef() | (null === n ? 0 : 128) | (null === r ? 0 : 64) | (null === s ? 0 : 32); if (m(t, i), null !== n && Ct(t, n), null !== r && Ct(t, r), null === n && null === r) { const e = this.parent; if (null === e._item) { const n = Rt(e); b(t, 1), _(t, n) } else b(t, 0), Ct(t, e._item.id); null !== s && _(t, s) } this.content.write(t, e) } } const hn = [() => { throw H() }, t => new He(M(t)), t => { const e = M(t), n = []; for (let r = 0; r < e; r++) { const e = N(t); "undefined" === e ? n.push(void 0) : n.push(JSON.parse(e)) } return new Ge(n) }, t => new ze(Object(u.a)(I(t))), t => new Ke(N(t)), t => new qe(JSON.parse(N(t))), t => new Ve(N(t), JSON.parse(N(t))), t => new ln(Ze[M(t)](t)), t => { const e = M(t), n = []; for (let r = 0; r < e; r++)n.push(D(t)); return new Xe(n) }]; class fn extends Je { constructor(t, e, n) { super(e), this.left = 128 == (128 & n) ? Tt(t) : null, this.right = 64 == (64 & n) ? Tt(t) : null; const r = 0 == (192 & n), s = !!r && 1 === M(t); this.parentYKey = r && s ? N(t) : null, this.parent = r && !s ? Tt(t) : null, this.parentSub = r && 32 == (32 & n) ? N(t) : null; const i = this._missing; null !== this.left && i.push(this.left), null !== this.right && i.push(this.right), null !== this.parent && i.push(this.parent), this.content = ((t, e) => hn[31 & e](t))(t, n), this.length = this.content.getLength() } toStruct(t, e, n) { if (n > 0) { const t = this.id; this.id = At(t.client, t.clock + n), this.left = At(this.id.client, this.id.clock - 1), this.content = this.content.splice(n), this.length -= n } const r = null === this.left ? null : ((t, e, n) => { const r = e.clients.get(n.client), s = $t(r, n.clock), i = r[s]; return n.clock !== i.id.clock + i.length - 1 && i.constructor !== $e && r.splice(s + 1, 0, an(t, i, n.clock - i.id.clock + 1)), i })(t, e, this.left), s = null === this.right ? null : Ht(t, this.right); let i = null, o = this.parentSub; if (null !== this.parent) { const t = Wt(e, this.parent); t.deleted || null !== r && r.constructor === $e || null !== s && s.constructor === $e || (i = t.content.type) } else if (null !== this.parentYKey) i = t.doc.get(this.parentYKey); else if (null !== r) r.constructor !== $e && (i = r.parent, o = r.parentSub); else { if (null === s) throw H(); s.constructor !== $e && (i = s.parent, o = s.parentSub) } return null === i ? new $e(this.id, this.length) : new un(this.id, r, this.left, s, this.right, i, o, this.content) } } var dn = n(6); const gn = new Map; const pn = "undefined" == typeof BroadcastChannel ? class { constructor(t) { this.room = t, this.onmessage = null, addEventListener("storage", e => e.key === t && null !== this.onmessage && this.onmessage({ data: u.d(e.newValue || "") })) } postMessage(t) { dn.a.setItem(this.room, u.e(u.b(t))) } } : BroadcastChannel, wn = t => a.c(gn, t, () => { const e = new Set, n = new pn(t); return n.onmessage = t => e.forEach(e => e(t.data)), { bc: n, subs: e } }), yn = (t, e) => { const n = wn(t); n.bc.postMessage(e), n.subs.forEach(t => t(e)) }; var mn = n(5); const bn = Math.floor, _n = (Math.ceil, Math.abs, Math.imul, Math.round, Math.log10, Math.log2, Math.log, Math.sqrt, (t, e) => t > e ? t : e); Number.isNaN, Math.pow, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, Number.isInteger, Number.isNaN; var vn = n(2); class Sn { constructor() { this.cpos = 0, this.cbuf = new Uint8Array(100), this.bufs = [] } } const En = t => { const e = new Uint8Array((t => { let e = t.cpos; for (let n = 0; n < t.bufs.length; n++)e += t.bufs[n].length; return e })(t)); let n = 0; for (let r = 0; r < t.bufs.length; r++) { const s = t.bufs[r]; e.set(s, n), n += s.length } return e.set(mn.a(t.cbuf.buffer, 0, t.cpos), n), e }, kn = (t, e) => { const n = t.cbuf.length; t.cpos === n && (t.bufs.push(t.cbuf), t.cbuf = new Uint8Array(2 * n), t.cpos = 0), t.cbuf[t.cpos++] = e }, An = (t, e) => { for (; e > 127;)kn(t, 128 | 127 & e), e >>>= 7; kn(t, 127 & e) }, Cn = (t, e) => Rn(t, vn.b(e)), Tn = (t, e) => { const n = t.cbuf.length, r = t.cpos, s = (i = n - r, o = e.length, i < o ? i : o); var i, o; const l = e.length - s; t.cbuf.set(e.subarray(0, s), r), t.cpos += s, l > 0 && (t.bufs.push(t.cbuf), t.cbuf = new Uint8Array(_n(2 * n, l)), t.cbuf.set(e.subarray(s)), t.cpos = l) }, Rn = (t, e) => { An(t, e.byteLength), Tn(t, e) }; new DataView(new ArrayBuffer(4)); class In { constructor(t) { this.arr = t, this.pos = 0 } } const Un = t => new In(t), Mn = (t, e) => { const n = mn.a(t.arr.buffer, t.pos + t.arr.byteOffset, e); return t.pos += e, n }, On = t => Mn(t, Nn(t)), Nn = t => { let e = 0, n = 0; for (; ;) { const r = t.arr[t.pos++]; if (e |= (127 & r) << n, n += 7, r < 128) return e >>> 0; if (n > 35) throw new Error("Integer out of range!") } }, Pn = t => vn.a(On(t)), xn = (t, e) => { An(t, 0); const n = yt(e); Rn(t, n) }, Dn = (t, e, n) => { An(t, 1), Rn(t, dt(e, n)) }, Bn = (t, e, n) => { ft(e, On(t), n) }, Ln = Bn, Yn = (t, e, n, r) => { const s = Nn(t); switch (s) { case 0: ((t, e, n) => { Dn(e, n, On(t)) })(t, e, n); break; case 1: Bn(t, n, r); break; case 2: Ln(t, n, r); break; default: throw new Error("Unknown message type") }return s }, jn = Date.now; var Fn = n(4); const Jn = () => new Set, $n = Array.from; class Wn extends class { constructor() { this._observers = Fn.a() } on(t, e) { Fn.b(this._observers, t, Jn).add(e) } once(t, e) { this.on(t, (...n) => { this.off(t, e), e(...n) }) } off(t, e) { const n = this._observers.get(t); void 0 !== n && (n.delete(e), 0 === n.size && this._observers.delete(t)) } emit(t, e) { return $n((this._observers.get(t) || Fn.a()).values()).forEach(t => t(...e)) } destroy() { this._observers = Fn.a() } }{ constructor(t) { super(), this.doc = t, this.states = new Map, this.meta = new Map, this._checkInterval = setInterval(() => { const e = jn(); null !== this.getLocalState() && 15e3 <= e - this.meta.get(t.clientID).lastUpdated && this.setLocalState(this.getLocalState()); const n = []; this.meta.forEach((r, s) => { s !== t.clientID && 3e4 <= e - r.lastUpdated && this.states.has(s) && n.push(s) }), n.length > 0 && zn(this, n, "timeout") }, bn(3e3)), t.on("destroy", () => { this.destroy() }), this.setLocalState({}) } destroy() { clearInterval(this._checkInterval) } getLocalState() { return this.states.get(this.doc.clientID) || null } setLocalState(t) { const e = this.doc.clientID, n = this.meta.get(e), r = void 0 === n ? 0 : n.clock + 1; null === t ? this.states.delete(e) : this.states.set(e, t), this.meta.set(e, { clock: r, lastUpdated: jn() }); const s = [], i = [], o = []; null === t ? o.push(e) : void 0 === n ? s.push(e) : i.push(e), this.emit("change", [{ added: s, updated: i, removed: o }, "local"]) } setLocalStateField(t, e) { const n = this.getLocalState(); null !== n && (n[t] = e, this.setLocalState(n)) } getStates() { return this.states } } const zn = (t, e, n) => { const r = []; for (let n = 0; n < e.length; n++) { const s = e[n]; if (t.states.has(s)) { if (t.states.delete(s), s === t.doc.clientID) { const e = t.meta.get(s); t.meta.set(s, { clock: e.clock + 1, lastUpdated: jn() }) } r.push(s) } } r.length > 0 && t.emit("change", [{ added: [], updated: [], removed: r }, n]) }, Hn = (t, e, n = t.states) => { const r = e.length, s = new Sn; An(s, r); for (let i = 0; i < r; i++) { const r = e[i], o = n.get(r) || null, l = t.meta.get(r).clock; An(s, r), An(s, l), Cn(s, JSON.stringify(o)) } return En(s) }, qn = (t, e) => console.warn(`Permission denied to access ${t.url}.\n${e}`), Vn = (t, e, n) => { const r = T(e), s = g(); switch (M(r)) { case 0: { b(s, 0); const e = Yn(r, s, t.doc, t); n && 1 === e && !t.synced && (t.synced = !0); break } case 3: b(s, 1), S(s, Hn(t.awareness, Array.from(t.awareness.getStates().keys()))); break; case 1: ((t, e, n) => { const r = Un(e), s = jn(), i = [], o = [], l = [], c = Nn(r); for (let e = 0; e < c; e++) { const e = Nn(r); let n = Nn(r); const c = JSON.parse(Pn(r)), a = t.meta.get(e), u = void 0 === a ? 0 : a.clock; (u < n || u === n && null === c && t.states.has(e)) && (null === c ? e === t.doc.clientID && null != t.getLocalState() ? n++ : t.states.delete(e) : t.states.set(e, c), t.meta.set(e, { clock: n, lastUpdated: s }), void 0 === a && null !== c ? i.push(e) : void 0 !== a && null === c ? l.push(e) : null !== c && o.push(e)) } (i.length > 0 || o.length > 0 || l.length > 0) && t.emit("change", [{ added: i, updated: o, removed: l }, n]) })(t.awareness, I(r), t); break; case 2: ((t, e, n) => { switch (Nn(t)) { case 0: n(e, Pn(t)) } })(r, t.doc, qn); break; default: return console.error("Unable to compute message"), s }return s }, Gn = t => { if (t.shouldConnect && null === t.ws) { const e = new t._WS(t.url); e.binaryType = "arraybuffer", t.ws = e, t.wsconnecting = !0, t.wsconnected = !1, t.synced = !1, e.onmessage = n => { t.wsLastMessageReceived = q(); const r = Vn(t, new Uint8Array(n.data), !0); p(r) > 1 && e.send(w(r)) }, e.onclose = () => { t.ws = null, t.wsconnecting = !1, t.wsconnected ? (t.wsconnected = !1, t.synced = !1, zn(t.awareness, Array.from(t.awareness.getStates().keys()), t), t.emit("status", [{ status: "disconnected" }])) : t.wsUnsuccessfulReconnects++, setTimeout(Gn, l(1200 * o(t.wsUnsuccessfulReconnects + 1), 2500), t) }, e.onopen = () => { t.wsLastMessageReceived = q(), t.wsconnecting = !1, t.wsconnected = !0, t.wsUnsuccessfulReconnects = 0, t.emit("status", [{ status: "connected" }]); const n = g(); if (b(n, 0), xn(n, t.doc), e.send(w(n)), null !== t.awareness.getLocalState()) { const n = g(); b(n, 1), S(n, Hn(t.awareness, [t.doc.clientID])), e.send(w(n)) } } } }, Xn = (t, e) => { t.wsconnected && t.ws.send(e), t.bcconnected && t.mux(() => { yn(t.url, e) }) }; class Kn extends L { constructor(t, e, n, { connect: r = !0, awareness: s = new Wn(n), params: i = {}, WebSocketPolyfill: o = WebSocket, resyncInterval: l = -1 } = {}) { for (super(); "/" === t[t.length - 1];)t = t.slice(0, t.length - 1); const c = (t => ((t, e) => { const n = []; for (const r in t) n.push(e(t[r], r)); return n })(t, (t, e) => `${encodeURIComponent(e)}=${encodeURIComponent(t)}`).join("&"))(i); this.bcChannel = t + "/" + e, this.url = t + "/" + e + (0 === c.length ? "" : "?" + c), this.roomname = e, this.doc = n, this._WS = o, this._localAwarenessState = {}, this.awareness = s, this.wsconnected = !1, this.wsconnecting = !1, this.bcconnected = !1, this.wsUnsuccessfulReconnects = 0, this.mux = (() => { let t = !0; return (e, n) => { if (t) { t = !1; try { e() } finally { t = !0 } } else void 0 !== n && n() } })(), this._synced = !1, this.ws = null, this.wsLastMessageReceived = 0, this.shouldConnect = r, this._resyncInterval = 0, l > 0 && (this._resyncInterval = setInterval(() => { if (this.ws) { this.synced || (alert("\n  Please report that this message was shown to https://github.com/yjs/y-websocket/issues\n\n  Thank you! â¤\n\n  (Sorry for showing this message.."), console.warn("Client was unsynced anyway")); const t = g(); b(t, 0), xn(t, n), this.ws.send(w(t)) } }, l)), this._bcSubscriber = t => { this.mux(() => { const e = Vn(this, new Uint8Array(t), !1); p(e) > 1 && yn(this.bcChannel, w(e)) }) }, this._updateHandler = (t, e) => { if (e !== this || null === e) { const e = g(); b(e, 0), ((t, e) => { An(t, 2), Rn(t, e) })(e, t), Xn(this, w(e)) } }, this.doc.on("update", this._updateHandler), this._awarenessUpdateHandler = ({ added: t, updated: e, removed: n }, r) => { const i = t.concat(e).concat(n), o = g(); b(o, 1), S(o, Hn(s, i)), Xn(this, w(o)) }, window.addEventListener("beforeunload", () => { zn(this.awareness, [n.clientID], "window unload") }), s.on("update", this._awarenessUpdateHandler), this._checkInterval = setInterval(() => { this.wsconnected && 3e4 < q() - this.wsLastMessageReceived && this.ws.close() }, 3e3), r && this.connect() } get synced() { return this._synced } set synced(t) { this._synced !== t && (this._synced = t, this.emit("sync", [t])) } destroy() { 0 !== this._resyncInterval && clearInterval(this._resyncInterval), clearInterval(this._checkInterval), this.disconnect(), this.awareness.off("update", this._awarenessUpdateHandler), this.doc.off("update", this._updateHandler), super.destroy() } connectBc() { var t, e; this.bcconnected || (t = this.bcChannel, e = this._bcSubscriber, wn(t).subs.add(e), this.bcconnected = !0), this.mux(() => { const t = g(); b(t, 0), xn(t, this.doc), yn(this.bcChannel, w(t)); const e = g(); b(e, 0), Dn(e, this.doc), yn(this.bcChannel, w(e)); const n = g(); b(n, 3), yn(this.bcChannel, w(n)); const r = g(); b(r, 1), S(r, Hn(this.awareness, [this.doc.clientID])), yn(this.bcChannel, w(r)) }) } disconnectBc() { const t = g(); var e, n; b(t, 1), S(t, Hn(this.awareness, [this.doc.clientID], new Map)), Xn(this, w(t)), this.bcconnected && (e = this.bcChannel, n = this._bcSubscriber, wn(e).subs.delete(n), this.bcconnected = !1) } disconnect() { this.shouldConnect = !1, this.disconnectBc(), null !== this.ws && this.ws.close() } connect() { this.shouldConnect = !0, this.wsconnected || null !== this.ws || (Gn(this), this.connectBc()) } } const Zn = [{ color: "#30bced", light: "#30bced33" }, { color: "#6eeb83", light: "#6eeb8333" }, { color: "#ffbc42", light: "#ffbc4233" }, { color: "#ecd444", light: "#ecd44433" }, { color: "#ee6352", light: "#ee635233" }, { color: "#9ac2c9", light: "#9ac2c933" }, { color: "#8acb88", light: "#8acb8833" }, { color: "#1be7ff", light: "#1be7ff33" }]; J(); const Qn = new class extends L { constructor({ gc: t = !0, gcFilter: e = (() => !0) } = {}) { super(), this.gc = t, this.gcFilter = e, this.clientID = J(), this.share = new Map, this.store = new Yt, this._transaction = null, this._transactionCleanups = [] } transact(t, e = null) { ee(this, t, e) } get(t, e = ie) { const n = Object(a.c)(this.share, t, () => { const t = new e; return t._integrate(this, null), t }), r = n.constructor; if (e !== ie && r !== e) { if (r === ie) { const r = new e; r._map = n._map, n._map.forEach(t => { for (; null !== t; t = t.left)t.parent = r }), r._start = n._start; for (let t = r._start; null !== t; t = t.right)t.parent = r; return r._length = n._length, this.share.set(t, r), r._integrate(this, null), r } throw new Error(`Type with the name ${t} has already been defined with a different constructor`) } return n } getArray(t) { return this.get(t, me) } getText(t) { return this.get(t, Pe) } getMap(t) { return this.get(t, _e) } getXmlFragment(t) { return this.get(t, De) } destroy() { this.emit("destroyed", [!0]), super.destroy() } on(t, e) { super.on(t, e) } off(t, e) { super.off(t, e) } }; class tr { constructor(t) { this.doc = Qn, this.orgName = t, this.docs = {}, this._awarenessListener = null, this.character = "_", this.listenAwereness = function () { } } createDoc(t, e) { if (!t || "" == t) return null; const n = this.parseType(t).id; if (this.docs[n]) return e && !this.__checkExistElement(this.docs[n].elements, e) && this.docs[n].elements.push(e), this.docs[n].types.some(e => e === t) || (this.docs[n].types.push(t), this.registerUpdateEvent(this.docs[n], t)), !1; const r = this.doc, s = `${"http:" === location.protocol ? "ws:" : "wss:"}//server.cocreate.app:8080/`; console.log("NEWID ", n), console.log("ClientID  ", this.doc.clientID); var i = new Kn(s, n, r); this.docs[n] = { id: n, doc: r, socket: i, elements: e ? [e] : [], types: [t] }; let o = i.awareness; return this._cursors = new Map, this._awarenessListener = e => { const n = e => { e !== this.doc.clientID && this.updateRemoteSelection(r, t, r.getText(t), this._cursors, e, o) }; e.added.forEach(n), e.removed.forEach(n), e.updated.forEach(n) }, o.on("change", this._awarenessListener), o.getStates().forEach((t, e) => { console.log("Update --") }), this.registerUpdateEvent(this.docs[n], t), !0 } registerUpdateEvent(t, e) { const n = t.doc.getText(e); let r = this; n.observe(n => { r.__setTypeObserveEvent(n, t.elements, e) }) } __checkExistElement(t, e) { for (var n = 0; n < t.length; n++)if (t[n].isSameNode(e)) return !0; return !1 } __setTypeObserveEvent(t, e, n) { if (!n) return; const r = t.delta, s = JSON.parse(atob(n)), i = t.target.toString(), o = new CustomEvent("cocreate-y-update", { detail: r }), l = new CustomEvent("store-content-db", { detail: i }); let c = !1; "object" == typeof s && (e.forEach(t => { CoCreateUtils.isReadValue(t) && t.getAttribute("name") === s.name && t.dispatchEvent(o) }), t.transaction.origin || (e.forEach(t => { "false" != t.getAttribute("data-save_value") && t.getAttribute("name") === s.name && (c = !0, t.dispatchEvent(l)) }), c && CoCreate.updateDocument({ collection: s.collection, document_id: s.document_id, data: { [s.name]: i }, metadata: "yjs-change" }))) } deleteDoc(t) { const e = this.parseType(t); this.docs[e.id] && delete this.docs[e.id] } generateDocName(t, e, n) { const r = { org: this.orgName, collection: t, document_id: e, name: n }; return btoa(JSON.stringify(r)) } insertData(t, e, n, r) { const s = this.parseType(t); this.docs[s.id] && (r ? this.docs[s.id].doc.getText(t).insert(e, n, r) : this.docs[s.id].doc.getText(t).insert(e, n)) } deleteData(t, e, n) { const r = this.parseType(t); this.docs[r.id] && this.docs[r.id].doc.getText(t).delete(e, n) } getWholeString(t) { const e = this.parseType(t); return this.docs[e.id] ? this.docs[e.id].doc.getText(t).toString() : "" } updateRemoteSelection(t, e, n, r, s, i) { if (console.log("CHANGE ---- DOCID ", this.doc.clientID, " OTHER CLIENTEID ", s), s !== this.doc.clientID) { const e = r.get(s); void 0 !== e && (e.caret.clear(), null !== e.sel && e.sel.clear(), r.delete(s)); const o = i.getStates().get(s); if (console.log(o), void 0 === o) { return console.log(" Cursor OUT ", s), document.querySelectorAll('[id*="socket_' + s + '"]').forEach((function (t, e, n) { t.parentNode.removeChild(t) })), void document.querySelectorAll('[id*="sel-' + s + '"]').forEach((function (t, e, n) { t.parentNode.removeChild(t) })) } const l = o.user || {}; null == l.color && (l.color = "#ffa500"), null == l.name && (l.name = `User: ${s}`); const c = o.cursor; if (console.log("Cursor ", c), null == c || null == c.anchor || null == c.head) { return document.querySelectorAll('[id*="socket_' + s + '"]').forEach((function (t, e, n) { t.parentNode.removeChild(t) })), void document.querySelectorAll('[id*="sel-' + s + '"]').forEach((function (t, e, n) { t.parentNode.removeChild(t) })) } const a = Pt(Ut(c.anchor), t), u = Pt(Ut(c.head), t); if (console.log("PRE Draw Cursor "), null !== a && null !== u && a.type === n && u.type === n) { let t, e; u.index < a.index ? (t = u.index, e = a.index) : (console.log(a.index), t = a.index, e = u.index), console.log("Draw Cursor ", t, e, s, o.user); let n = tr.parseTypeName(c.anchor.tname), r = (n.document_id, n.name, {}), i = '[data-collection="' + n.collection + '"][data-document_id="' + n.document_id + '"][name="' + n.name + '"]'; i += ":not(.codemirror):not(.quill)"; let l = document.querySelectorAll(i), h = this; l.forEach((function (n, l, c) { r = { element: n, startPosition: t, selector: i, endPositon: e, clientId: s, user: { color: o.user.color, name: o.user.name } }, draw_cursor(r), h.listen(r) })) } } } changeListenAwereness(t) { this.listenAwereness = t } listen(t) { this.listenAwereness.apply(this, [t]) } destroyObserver(t, e) { const n = this.parseType(t); this.docs[n.id].doc.getText(t).unobserve(t => { }), this.docs[n.id].socket.awareness.off("change", this._awarenessListener) } getProvider(t) { const e = this.parseType(t); return this.docs[e.id] ? this.docs[e.id].socket : null } getType(t) { const e = this.parseType(t); return this.docs[e.id] ? this.docs[e.id].doc.getText(t) : null } setCursorNull(t) { const e = this.parseType(t); if (!this.docs[e.id]) return null; this.docs[e.id].socket.awareness.setLocalStateField("cursor", null) } setPositionYJS(t, e, n) { const r = this.parseType(t), s = this.getType(t); if (s) { var i = Nt(s, e), o = Nt(s, n); console.log("Sending Cursor ", { anchor: i, head: o }, { to: n, from: e }), this.docs[r.id].socket.awareness.setLocalStateField("cursor", { anchor: i, head: o }), console.log("Cursor Send") } } sendPosition(t) { let e = t.collection, n = t.document_id, r = t.name, s = t.startPosition, i = t.endPositon, o = tr.generateID(config.organization_Id, e, n, r); this.setPositionYJS(o, s, i) } static generateID(t, e, n, r) { const s = { org: t, collection: e, document_id: n, name: r }; return btoa(JSON.stringify(s)) } static parseTypeName(t) { return JSON.parse(atob(t)) } parseType(t) { let e = JSON.parse(atob(t)), n = { org: e.org, collection: e.collection, document_id: e.document_id }; return { id: btoa(JSON.stringify(n)), name: e.name } } } window.CoCreateYSocket = tr, window.CoCreateCrdt = new tr(config.organization_Id) }]);
//# sourceMappingURL=CoCreate-crdt.js.map


const CoCreateInput = {

    selector: "input, textarea, select",

    init: function () {
        registerModuleSelector(this.selector);

        let inputs = document.querySelectorAll(this.selector);
        const self = this;

        inputs.forEach((input) => {

            const collection = input.getAttribute('data-collection')
            if (CoCreateUtils.isJsonString(collection)) {
                return;
            }

            if (self.isUsageY(input)) {
                return;
            }
            if (CoCreateInit.getInitialized(input)) {
                return;
            }
            CoCreateInit.setInitialized(input);
            self.__initEvents(input);

        })
    },

    initElement: function (container) {

        let mainContainer = container || document;
        if (!mainContainer.querySelectorAll) {
            return;
        }

        const _this = this;
        let inputs = mainContainer.querySelectorAll(this.selector);

        inputs.forEach((input) => {
            if (CoCreateInit.getInitialized(input)) {
                return;
            }
            CoCreateInit.setInitialized(input)

            const collection = input.getAttribute('data-collection')
            const id = input.getAttribute('data-document_id')
            if (CoCreateUtils.isJsonString(collection)) {
                return;
            }

            if (_this.isUsageY(input)) {
                return;
            }

            if (id && collection) {
                CoCreate.readDocument({
                    collection: collection,
                    document_id: id
                })
            }
            _this.__initEvents(input);


        })
    },

    save: function (input) {

        const value = this.getValue(input);
        const collection = input.getAttribute('data-collection') || 'module_activity'

        const document_id = input.getAttribute('data-document_id')
        const name = input.getAttribute('name')
        // CoCreate.updateDocument({
        // 	collection,
        // 	document_id,
        // 	data: {
        // 		[name]: value
        // 	}
        // })
        CoCreate.replaceDataCrdt({
            collection, document_id, name, value,
            update_crud: true
        })
    },

    isUsageY: function (input) {
        if (CoCreateUtils.isJsonString(input.getAttribute('data-collection'))) {
            return false;
        }

        if (CoCreateUtils.isJsonString(input.getAttribute('name'))) {
            return false;
        }

        if ((input.tagName === "INPUT" && ["text", "number", "email", "tel", "url"].includes(input.type)) || input.tagName === "TEXTAREA") {

            if (!input.getAttribute('name')) {
                return false;
            }
            if (input.getAttribute("data-realtime") == "false") {
                return false;
            }

            if (input.getAttribute("data-unique") === "true") {
                return false;
            }

            if (input.type === 'password') {
                return false;
            }

            if (!CoCreateUtils.isReadValue(input)) {
                return false;
            }
            return true;
        }
        return false;
    },

    render: function (data, allTags) {
        let inputs = document.querySelectorAll(this.selector)
        let _this = this;

        inputs.forEach((input) => {
            if (!allTags) {
                if (_this.isUsageY(input)) return;
            }

            const collection = input.getAttribute('data-collection')
            const id = input.getAttribute('data-document_id')
            const name = input.getAttribute('name')
            const data_fetch_value = input.getAttribute('data-fetch_value');

            if (data_fetch_value === "false" || !CoCreateUtils.isReadValue(input)) return;

            if (data['collection'] == collection && data['document_id'] == id && (name in data.data)) {
                _this.setValue(input, data['data'][name]);

                // fetch value event
                input.dispatchEvent(new Event("updated_by_fetch"));

                input.dispatchEvent(new CustomEvent('CoCreateInput-run', {
                    eventType: 'rendered',
                    item: input,

                }))
            }
        })

    },

    getValue: function (input) {
        let value = input.value;

        if (input.type === "checkbox") {
            value = input.checked
        }
        else if (input.type === "number") {
            value = Number(value)
        }
        else if (input.type === "password") {
            value = this.__encryptPassword(value)
        }
        return value;
    },

    setValue: function (input, value) {
        if (input.type == 'checkbox') {
            input.checked = value;
        }
        else if (input.type === 'radio') {
            input.value == value ? input.checked = true : input.checked = false
        }

        if (input.type === 'password') {
            value = this.__decryptPassword(value);
        }

        input.value = value;

        if (CoCreateFloatLabel) {
            CoCreateFloatLabel.update(input, value)
        }
    },

    __initEvents: function (input) {

        let _this = this;
        const self = this;
        input.addEventListener('clicked-submitBtn', function () {
            self.save(this)
        })

        input.addEventListener('set-document_id', function () {
            CoCreate.initDataCrdt({
                collection: input.getAttribute('data-collection'),
                document_id: input.getAttribute('data-document_id'),
                name: input.getAttribute('name'),
                element: input
            })
            self.save(this)
        })

        input.addEventListener('input', function (e) {
            if (CoCreateUtils.isRealTime(this)) {
                self.save(this)
            }
        })

        input.addEventListener('change', function (e) {
            if (this.tagName == 'SELECT' && CoCreateUtils.isRealTime(this)) {
                self.save(this)
            }
        })

        CoCreateSocket.listen('updateDocument', function (data) {
            self.render(data);
        })

        CoCreateSocket.listen('connect', function (data) {
            self.__getReqeust()
        })

        CoCreateSocket.listen('readDocument', function (data) {
            self.render(data, true);
        })

        //. create store observer(yjs)
        CoCreate.initDataCrdt({
            collection: input.getAttribute('data-collection'),
            document_id: input.getAttribute('data-document_id'),
            name: input.getAttribute('name'),
            element: input
        })
    },

    __getReqeust: function (container) {

        let fetch_container = container || document;
        let inputs = fetch_container.querySelectorAll(this.selector)
        let requestData = [];

        inputs.forEach((input) => {
            if (CoCreateInput.isUsageY(input)) return;

            const collection = input.getAttribute('data-collection')
            const id = input.getAttribute('data-document_id')

            if (id && !requestData.some((d) => d['collection'] === collection && d['document_id'] === id)) {
                requestData.push({
                    'collection': collection,
                    'document_id': id
                })
            }
        })
        return requestData;
    },

    __encryptPassword: function (str) {
        var encodedString = btoa(str);
        return encodedString;
    },

    __decryptPassword: function (str) {
        if (!str) {
            return "";
        }

        var decode_str = atob(str);
        return decode_str;
    }

}

CoCreateInput.init();
CoCreateInit.register('CoCreateInput', CoCreateInput, CoCreateInput.initElement);
/**Uso esta variable para mostrar errores en caso que no este en prod*/

var element_multicursors = document.querySelectorAll('input,textarea')

var debug = true
var enviroment_prod = true
var properties = ['boxSizing', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'textRendering', 'webkitWritingMode', 'textTransform', 'textIndent', 'overflowWrap'];
var length_uuid = 30;


class CocreateUtilsCursor {

    static print(message, debug) {
        debug = debug || false;
        if (debug)
            console.log(message)
    }

    static generateUUID(length = null) {
        var d = new Date().getTime();
        var d2 = (performance && performance.now && (performance.now() * 1000)) || 0;//Time in microseconds since page-load or 0 if unsupported
        var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16;
            if (d > 0) {
                var r = (d + r) % 16 | 0;
                d = Math.floor(d / 16);
            } else {
                var r = (d2 + r) % 16 | 0;
                d2 = Math.floor(d2 / 16);
            }
            return (c == 'x' ? r : (r & 0x7 | 0x8)).toString(16);
        });
        if (length != null) {
            uuid = uuid.substr(0, length)
        }
        return uuid;
    }

}



var getParents = function (elem, selector) {

    if (!Element.prototype.matches) {
        Element.prototype.matches =
            Element.prototype.matchesSelector ||
            Element.prototype.mozMatchesSelector ||
            Element.prototype.msMatchesSelector ||
            Element.prototype.oMatchesSelector ||
            Element.prototype.webkitMatchesSelector ||
            function (s) {
                var matches = (this.document || this.ownerDocument).querySelectorAll(s),
                    i = matches.length;
                while (--i >= 0 && matches.item(i) !== this) { }
                return i > -1;
            };
    }
}

var mirrorDiv, computed, style;

var getCaretCoordinates = function (element, position_start, position_end) {
    // mirrored div
    let name = element.getAttribute('name')
    let document_id = element.getAttribute('data-document_id') || '';
    if (document_id == '') {
        return false;
    }
    var ID_MIRROR = element.dataset['mirror_id']; //document_id + name +  '--mirror-div';
    mirrorDiv = document.getElementById(ID_MIRROR);
    var add_class_scroll = (element.className.indexOf('floating-label') == -1) ? false : true;

    if (!mirrorDiv) {
        mirrorDiv = document.createElement('div');
        mirrorDiv.id = ID_MIRROR;//document_id +name+ '--mirror-div';
        mirrorDiv.className = (enviroment_prod) ? 'mirror_color mirror_scroll mirror-width-scroll' : 'mirror-width-scroll';
        document.body.appendChild(mirrorDiv);
    }

    var scrollwidth = element.offsetWidth - element.scrollWidth;

    style = mirrorDiv.style;
    computed = getComputedStyle(element);
    let margin_top = parseInt(computed['marginTop'])
    let margin_left = parseInt(computed['marginLeft'])

    if (element.nodeName !== 'INPUT') {
        style.wordWrap = 'break-word';  // only for textarea-s
        style.whiteSpace = 'pre-wrap';
    } else {
        style.whiteSpace = 'pre';
    }
    // position off-screen
    style.position = 'absolute';  // required to return coordinates properly

    var rect = element.getBoundingClientRect(); // get Position from element


    let scrrollTop_browser = document.documentElement.scrollTop

    style.top = ((rect.top + scrrollTop_browser) - 1) - (parseInt(computed['marginTop']) - parseInt(computed['borderTopWidth'])) + 'px'//parseInt(computed.borderTopWidth) + 'px'; //  element.offsetTop + parseInt(computed.borderTopWidth) + 'px';
    style.left = rect.left - (parseInt(computed['marginLeft']) - parseInt(computed['borderLeftWidth'])) + 'px'//parseInt(computed.borderLeftWidth) + 'px'   // margin_left+"px";//"400px";
    style.width = rect.width - (parseInt(computed.borderLeftWidth) + parseInt(computed.borderRightWidth)) + 'px'   // margin_left+"px";//"400px";
    style.height = rect.height - (parseInt(computed.borderTopWidth) + parseInt(computed.borderBottomWidth)) + 'px'   // margin_left+"px";//"400px";
    style.visibility = 'visible'
    properties.forEach(function (prop) {
        style[prop] = computed[prop];
    });

    if (element.nodeName.toLowerCase() == 'input') {
        style.overflowX = 'auto';
        style.overflowY = 'hidden';
    } else {
        style.overflow = "visible"
    }
    style.paddingRight = (parseInt(style.paddingRight) + scrollwidth - parseInt(computed.borderRightWidth)) + 'px';
    let cursor_container = mirrorDiv.querySelectorAll('.cursor-container');
    let selectors_by_users = mirrorDiv.querySelectorAll('.selectors_by_users');
    let value_element = (['TEXTAREA', 'INPUT'].indexOf(element.nodeName) == -1) ? element.innerHTML : element.value;

    mirrorDiv.textContent = value_element.substring(0, position_start);
    if (element.nodeName === 'INPUT')
        mirrorDiv.textContent = mirrorDiv.textContent.replace(/\s/g, "\u00a0");
    var span = document.createElement('span');
    span.id = element.nodeName + 'span_selections';
    let value_span = value_element.substring(position_start, position_end) || ''
    span.textContent = value_span;  // || because a completely empty faux span doesn't render at all
    //span.style.backgroundColor = "lightgrey";
    mirrorDiv.appendChild(span);

    if (cursor_container) {
        cursor_container.forEach(function (child_cursor, index, array) {
            mirrorDiv.appendChild(child_cursor);
        })
    }

    if (selectors_by_users) {
        selectors_by_users.forEach(function (child_selection, index, array) {
            mirrorDiv.appendChild(child_selection);
        })
    }

    let value_end = value_element.substring(position_end) || '';
    var span_end = document.createElement('span');
    mirrorDiv.appendChild(span_end);
    span_end.textContent = value_end;
    var rect = element.getBoundingClientRect(); // get Position from element
    var coordinates = {
        start: {
            top: span.offsetTop,
            left: span.offsetLeft
        },
        end: {
            top: span_end.offsetTop, //+ parseInt(computed['borderTopWidth']),
            left: span_end.offsetLeft // + parseInt(computed['borderLeftWidth'])
        }
    };

    return coordinates;
}

function getStyle(el, styleProp) {
    if (window.getComputedStyle)
        var y = document.defaultView.getComputedStyle(el, null).getPropertyValue(styleProp);
    return y;
}


function getDocument(collection, module_id) {
    CoCreate.readDocument({
        'collection': collection,
        'document_id': module_id
    })
}

CoCreateSocket.listen('readDocument', function (data) {
    cursor = document.querySelector('.cursor-flag[data-document_id="' + data['document_id'] + '"]')
    if (cursor)
        cursor.innerHTML = data.result[cursor.getAttribute('name')]
})


function draw_cursor(json) {
    CocreateUtilsCursor.print(["draw Cursor ", json], debug)
    let element = json['element'];
    let activate_cursor = (element.dataset['cursors']) ? element.dataset['mirror_id'] : true;
    if (activate_cursor) {
        let start = json['startPosition']
        let end = json['endPositon']
        let socket_id = json['clientId']
        let document_id = element.getAttribute('data-document_id') || '';
        if (document_id != '') {
            CocreateUtilsCursor.print("action document_id " + document_id, debug)
            if (typeof element.dataset['mirror_id'] == 'undefined' || element.dataset['mirror_id'] == '')
                element.dataset['mirror_id'] = CocreateUtilsCursor.generateUUID(length_uuid)
            let coordinates = getCaretCoordinates(element, start, end);
            if (!coordinates)
                return false;
            let name = element.getAttribute('name')
            let id_mirror = element.dataset['mirror_id']; //document_id+name+'--mirror-div'
            let mi_mirror = document.getElementById(id_mirror)
            let cursor = false;
            let selection_user = false;
            let identify = '_' + id_mirror;
            let user = (typeof (json) != 'undefined' && json.hasOwnProperty('user')) ? json.user : false
            let user_id = (typeof (json) != 'undefined' && json.hasOwnProperty('user_id')) ? user.user_id : false
            if (socket_id) {
                //if(data && data.hasOwnProperty('id_mirror')){
                cursores_other_elements = document.querySelectorAll('#socket_' + socket_id + identify)
                cursores_other_elements.forEach(function (child_cursor, index, array) {
                    if (child_cursor.parentElement.getAttribute('id') != id_mirror) {
                        CocreateUtilsCursor.print("remove old cursor others elements", debug)
                        child_cursor.remove()
                    }
                })
                //}
                cursor = mi_mirror.querySelector('.cursor-container#socket_' + socket_id + identify);
                if (!cursor && json.hasOwnProperty('user')) {
                    if (user) {
                        CocreateUtilsCursor.print("Create Cursor", debug)
                        let cursor_template = '<div style="color:blue;" class="cursor-container" \
                                                  id="socket_'+ socket_id + identify + '" \
                                                  ><div class="cursor" \
                                                  style="background-color:'+ user.color + '"></div>\
                                                  <div class="cursor-flag" data-collection="users" \
                                                  name="name" \
                                                  data-user_name="'+ user.name + '" \
                                                  data-user_color="'+ user.color + '" \
                                                  data-socket_id="'+ socket_id + '" \
                                                  data-id_mirror="'+ id_mirror + '" \
                                                  data-document_id="'+ user_id + '" \
                                                  style="background-color:'+ user.color + '" \
                                                  flag>'+ user.name + '</div></div>';
                        mi_mirror.innerHTML = cursor_template + mi_mirror.innerHTML;

                    }
                    if (user_id) {
                        // si tiene user_id actualiza el nombre del cursor usando crud
                        CoCreate.readDocument({
                            'collection': 'users',
                            'document_id': user_id
                        })
                    }
                }
                cursor = mi_mirror.querySelector('.cursor-container#socket_' + socket_id + identify);
            }
            if (cursor) {
                CocreateUtilsCursor.print(["Update Cursor", cursor, coordinates], debug)
                let font_size = getStyle(element, 'font-size')
                font_size = parseFloat(font_size.substring(0, font_size.length - 2));
                let cursor_height = ((font_size * 112.5) / 100)
                let my_cursor = cursor.querySelector('.cursor')

                cursor.dataset.start = start
                cursor.dataset.end = end
                cursor.dataset.socket_id = socket_id
                cursor.dataset.user_name = socket_id

                cursor.style["top"] = coordinates.end.top + "px";

                cursor.style["width"] = "2px";  //2px
                my_cursor.style["height"] = cursor_height + "px";
                cursor.style["left"] = coordinates.end.left + "px";

                //add selections
                selection_user = document.getElementById('sel-' + socket_id + identify);
                if ((start != end) && user) {
                    selection_user = document.getElementById('sel-' + socket_id + identify)
                    if (selection_user) {
                        selection_user.remove()
                    }
                    var scrollwidth = element.offsetWidth - element.scrollWidth;
                    var padding_right = parseInt(getComputedStyle(element)["paddingRight"])
                    selection_user = document.createElement('span');
                    selection_user.id = 'sel-' + socket_id + identify;
                    selection_user.className = 'selectors_by_users'
                    let style_mirror = getComputedStyle(mi_mirror)
                    selection_user.style["position"] = "absolute";
                    selection_user.style["top"] = style_mirror.paddingTop;
                    selection_user.style["left"] = style_mirror.paddingLeft;
                    selection_user.style["padding-right"] = scrollwidth + padding_right + "px";
                    mi_mirror.insertBefore(selection_user, mi_mirror.firstChild);
                    let selection_span_by_user = document.createElement('span');
                    selection_span_by_user.id = 'selection-' + socket_id + identify;
                    selection_span_by_user.style.backgroundColor = user.color;
                    let value_element = (['TEXTAREA', 'INPUT'].indexOf(element.nodeName) == -1) ? element.innerHTML : element.value;
                    selection_user.textContent = value_element.substring(0, start);
                    let value_span_selection = value_element.substring(start, end) || ''
                    //selection_span_by_user.style.opacity = 0.5;
                    selection_span_by_user.textContent = value_span_selection;
                    selection_user.appendChild(selection_span_by_user)
                }//end Selections
                else {
                    if (selection_user)
                        selection_user.remove()
                }
            }
        }//end if document_id
    }//end activate_cursors
}//draw_cursor

function refresh_mirror(element) {
    let document_id = element.getAttribute('data-document_id') || '';
    if (document_id != '') {
        name = element.getAttribute('name')
        id_mirror = document_id + name + '--mirror-div'
        mi_mirror = document.getElementById(id_mirror)
        selector_element = element.nodeName + "[name='" + name + "'][data-document_id='" + document_id + "']"
        if (debug)
            console.log("selector -> " + selector_element)
        if (mi_mirror) {
            computed = getComputedStyle(element);
            style = mi_mirror.style
            style.width = element.offsetWidth - (parseInt(computed.borderLeftWidth) + parseInt(computed.borderRightWidth)) + 'px'
            style.height = element.offsetHeight - (parseInt(computed.borderTopWidth) + parseInt(computed.borderBottomWidth)) + 'px'
            cursor_container = mi_mirror.querySelectorAll('.cursor-container');
            cursor_container.forEach(function (child_cursor, index, array) {
                let dataset = child_cursor.dataset;
                draw_cursor({
                    element: element,
                    startPosition: dataset.start,
                    endPositon: dataset.end,
                    clientId: dataset.socket_id,
                    user: {
                        'color': dataset.user_color,
                        'name': dataset.user_name
                    },
                });
            })
        }
    }//end document
}//end verify 

Element.prototype.remove = function () {
    if (this.parentElement) {
        this.parentElement.removeChild(this);
    }
}



function recalculate_local_cursors(element, count) {
    CocreateUtilsCursor.print("count " + count, debug)
    let my_start = element.selectionStart;
    let name = element.getAttribute('name') || '';
    let document_id = element.getAttribute('data-document_id') || '';
    let collection = element.getAttribute('data-collection') || '';
    let selector = '[data-collection="' + collection + '"][data-document_id="' + document_id + '"][name="' + name + '"]'
    let id_mirror = element.dataset['mirror_id']; //let id_mirror = document_id+name+'--mirror-div';
    let mirrorDiv = document.getElementById(id_mirror);
    let cursor_container = mirrorDiv.querySelectorAll('.cursor-container');
    if (cursor_container) {
        cursor_container.forEach(function (child_cursor, index, array) {
            let start = parseInt(child_cursor.getAttribute('data-start'));
            let user_name = child_cursor.getAttribute('data-user_name');
            CocreateUtilsCursor.print(["my_start local", my_start, 'start cursor ' + user_name + " = ", start], debug)
            if (start > my_start) {
                CocreateUtilsCursor.print("Es mayor", debug)

                let end = parseInt(child_cursor.getAttribute('data-end'));
                let pos_start = start + count;
                let pos_end = end + count;

                CocreateUtilsCursor.print(['pos_start', pos_start, 'pos_end', pos_end], debug)

                let dataset = child_cursor.querySelector('.cursor-flag').dataset
                let clientId = dataset.socket_id;
                let json = {
                    element: element,
                    startPosition: pos_start,
                    endPositon: pos_end,
                    clientId: clientId,
                    'user': {
                        'color': dataset.user_color,
                        'name': dataset.user_name
                    },
                }

                CocreateUtilsCursor.print(["sent Draw Cursor ", json], debug)

                draw_cursor(json);

            }
            //mirrorDiv.appendChild(child_cursor);
        })
    }
}


function initCursorEl(element) {
    let formulario = getParents(element, 'form')
    if (debug)
        console.log(element.getAttribute('data-realtime'))
    if (element.getAttribute('data-realtime') == 'true' || (formulario && formulario.getAttribute('data-realtime') == 'true')) {
        if (element.getAttribute('data-realtime') == 'false')
            return false;
        element.addEventListener('input', function (event) {
            let start = element.selectionStart;
            let end = element.selectionEnd;
            let coordinates = getCaretCoordinates(element, start, end);
            let count = 0;
            switch (event.inputType) {
                case 'insertText':
                    count = 1;
                    break;
                case 'insertFromPaste':
                    // count = event.clipboardData.getData('Text').length
                    break;
                case 'deleteContentBackward':
                    //case 'insertFromPaste':
                    count = -1;
                    break;
            }
            if (count)
                recalculate_local_cursors(this, count)
        }, false)

        //mirror scroll textarea and div background
        if (element.nodeName == 'TEXTAREA') {
            element.addEventListener('scroll', function () {
                let name = element.getAttribute('name')
                let document_id = element.getAttribute('data-document_id') || '';
                let id_mirror = element.dataset['mirror_id']; //let id_mirror = document_id+name+'--mirror-div';
                let mi_mirror = document.getElementById(id_mirror)
                if (mi_mirror) {
                    mi_mirror.scrollTo(element.scrollLeft, element.scrollTop);
                }
            }, false)

            //resize
            function outputsize() {

                element_multicursors.forEach(function (element_for, index, array) {
                    let name = element_for.getAttribute('name')
                    //let document_id = element_for.getAttribute('data-document_id')
                    let id_mirror = element.dataset['mirror_id']; //let id_mirror = document_id+name+'--mirror-div';
                    let mi_mirror = document.getElementById(id_mirror)

                    if (mi_mirror) {
                        mi_mirror.style["width"] = element_for.offsetWidth + "px";
                        mi_mirror.style["height"] = element_for.offsetHeight + "px";
                        var isFocused = (document.activeElement === element_for);
                        //verify_cursor(element_for,isFocused)
                        var isFocused = (document.activeElement === element);
                        //if(isFocused)
                        //  getCaretCoordinates(element,element.selectionStart,element.selectionEnd)
                        refresh_mirror(element)
                        console.log(" REsize")
                    }
                })
            }
            new ResizeObserver(outputsize).observe(element)

        } else {
            //if (element.nodeName == 'INPUT'){
            element.addEventListener('mousemove', function (event) {
                let name = element.getAttribute('name')
                let document_id = element.getAttribute('data-document_id')
                let id_mirror = element.dataset['mirror_id']; //let id_mirror = document_id+name+'--mirror-div';
                let mi_mirror = document.getElementById(id_mirror)
                if (mi_mirror)
                    mi_mirror.scrollTo(element.scrollLeft, element.scrollTop);
            });

            element.addEventListener('focusout', function (event) {
                let name = element.getAttribute('name')
                let document_id = element.getAttribute('data-document_id') || '';
                let id_mirror = element.dataset['mirror_id']; //let id_mirror = document_id+name+'--mirror-div';
                let mi_mirror = document.getElementById(id_mirror)
                if (mi_mirror)
                    mi_mirror.scrollTo(element.scrollLeft, element.scrollTop);

            })

            element.addEventListener('keyup', function (event) {
                let name = element.getAttribute('name')
                let id_mirror = element.dataset['mirror_id']; //let id_mirror = document_id+name+'--mirror-div';
                let mi_mirror = document.getElementById(id_mirror)
                if (mi_mirror)
                    mi_mirror.scrollTo(element.scrollLeft, element.scrollTop);
            })

        }
    }//end if realtime TRUE
}

var initialize_multicursor = function (element_multicursors) {
    element_multicursors.forEach(function (element, index, array) {
        initCursorEl(element);
    }); // element_multicursors.forEach
}//end initialize_multicursor 

function initCursorElements(container) {
    let mainContainer = container || window;

    if (!mainContainer.querySelectorAll) {
        return;
    }

    let elements = mainContainer.querySelectorAll('[data-realtime=true]');

    elements.forEach(el => {
        initCursorEl(el);
    })
}

if (debug)
    console.log("elements to INIT -> ", element_multicursors)
initialize_multicursor(element_multicursors);

// CoCreateInit.register_old('[data-realtime=true]',initCursorEl);
CoCreateInit.register('CoCreateCursor', window, initCursorElements);

"use strict";


var CoCreateText = {
    elements: [],

    init: function () {
        this.initElement(document);
        // this.initSockets();
    },

    initElement: function (container) {
        var self = this;
        let fetch_container = container || document;

        let elements = fetch_container.querySelectorAll('input[data-document_id][name], textarea[data-document_id][name]');
        if (elements.length == 0 &&
            fetch_container != document &&
            fetch_container.hasAttribute('data-document_id') &&
            fetch_container.hasAttribute('name')) {
            elements = [fetch_container];
        }

        for (var i = 0; i < elements.length; i++) {
            // CoCreateUtils.disableAutoFill(elements[i])
            if (!CoCreateInput.isUsageY(elements[i])) {
                continue;
            }

            if (this.checkExistElement(elements[i])) {
                // this.setInitValue(elements[i])
                continue;
            }

            if (CoCreateInit.getInitialized(elements[i])) {
                continue;
            }
            CoCreateInit.setInitialized(elements[i]);

            this.__initEvents(elements[i]);

            if (CoCreateDocument.checkID(elements[i])) {
                this.createYDoc(elements[i]);

            } else {
                //. register create document_id event
                elements[i].addEventListener('set-document_id', function (event) {
                    var el = this;
                    var text_str = el.value;

                    self.createYDoc(el);
                    self.sendChangeData(el, text_str, 0, text_str.length);
                })
            }
        }
    },

    checkExistElement: function (element) {
        for (var i = 0; i < this.elements.length; i++) {
            if (this.elements[i].isSameNode(element)) {
                return true;
            }
        }
        return false;
    },

    setInitValue: function (element) {
        var typeId = this.generateTypeName(element);
        var value = CoCreateCrdt.getWholeString(typeId);
        element.value = value;
    },

    createYDoc: function (element) {
        const collection = element.getAttribute('data-collection')
        const document_id = element.getAttribute('data-document_id')
        const status = CoCreate.initDataCrdt({
            collection: collection,
            document_id: document_id,
            name: element.getAttribute('name'),
            element: element,
        })

        //. get Crud document

        // CoCreate.readDocument({
        //   collection: collection,
        //   document_id: document_id,
        //   metadata: {
        //     type: 'crdt'
        //   }
        // })

        this.elements.push(element)
    },


    __initEvents: function (input_element) {

        //. selection event
        const self = this;

        input_element.addEventListener('select', function () {
            if (this.selectionEnd !== this.selectionStart) {
                self.setSelectionInfo(this, true, this.selectionStart, this.selectionEnd)

                if (document.activeElement === this)
                    self.sendPosition(this);
            }
        });

        input_element.addEventListener('keyup', function (event) {
            let arrows = [37, 38, 39, 40];
            if (arrows.indexOf(event.keyCode) != -1) {
                self.sendPosition(this);
            }
        });

        input_element.addEventListener('keydown', function (event) {
            let arrows = [37, 38, 39, 40];
            if (arrows.indexOf(event.keyCode) != -1) {
                self.sendPosition(this);
            }
        });

        input_element.addEventListener('click', function (event) {
            if (document.activeElement === this)
                self.sendPosition(this);
        });

        input_element.addEventListener('blur', function (event) {
            const id = self.generateTypeName(this);
            CoCreateCrdt.setCursorNull(id);
        });

        input_element.addEventListener('input', function (event) {
            let nowstart = this.selectionStart - 1;
            let nowend = nowstart;
            let selection_info = self.getSelectionInfo(this);
            let content_text = "";
            let isUpdate = false;
            switch (event.inputType) {
                case 'deleteContentBackward':
                    isUpdate = true;
                    nowstart++;
                    nowend = nowstart + 1;
                    break;
                case 'deleteContentForward':
                    isUpdate = true;
                    nowstart++;
                    nowend = nowstart + 1;
                    break;
                case 'insertLineBreak':
                    isUpdate = true;
                    content_text = "\n";
                    nowend++;
                    break;
                case 'insertText':
                    isUpdate = true;
                    content_text = event.data || "\n";
                    break;
                case 'deleteByCut':
                    isUpdate = true;
                    break;

            }

            if (isUpdate) {
                if (selection_info.is_selected) {
                    //. delete event
                    let character_deleted = selection_info.start - selection_info.end;

                    recalculate_local_cursors(this, character_deleted)

                    self.sendChangeData(this, "", selection_info.start, selection_info.end);
                    if (content_text.length > 0) {
                        self.sendChangeData(this, content_text, nowstart, nowend);
                    }
                    self.setSelectionInfo(this, false, this.selectionStart, this.selectionStart);
                } else {

                    self.sendChangeData(this, content_text, nowstart, nowend);
                }
            }
        })

        /** unselect events **/
        input_element.addEventListener('blur', function (e) {
            self.setSelectionInfo(this, false, this.selectionStart, this.selectionStart);
        })
        input_element.addEventListener('click', function (e) {
            self.setSelectionInfo(this, false, this.selectionStart, this.selectionStart);
        })

        /** past events **/
        input_element.addEventListener('paste', function (event) {
            let content_text = event.clipboardData.getData('Text');
            let start = this.selectionStart;
            let end = this.selectionEnd;
            //. send delete event
            if (start != end) {
                this.setSelectionRange(end, end)
                self.sendChangeData(this, "", start, end, false);
            }
            if (start == end) {
                // to calculate Cursors in collaboration 
                // recalculate_local_cursors(this,content_text.length)
            }
            //. insert event
            self.sendChangeData(this, content_text, start, start, false);
            event.preventDefault()
        })

        input_element.addEventListener('cocreate-y-update', function (event) {
            var info = event.detail;

            input_element.crudSetted = true;

            var pos = 0;
            var flag = true;

            info.forEach(item => {
                if (item.retain) {
                    flag = true;
                    pos = item.retain;
                }

                if (item.insert || item.delete) {
                    if (flag == false) pos = 0;
                    flag = false;

                    if (item.insert) {
                        //. insert process
                        self.updateChangeData(this, item.insert, pos, pos)
                    } else if (item.delete) {
                        //. delete process
                        self.updateChangeData(this, "", pos, pos + item.delete);
                    }

                }
            })
        })
    },

    __initSockets: function () {
        const self = this;
        CoCreateSocket.listen('readDocument', function (data) {

            if (!data.metadata || data.metadata.type != "crdt") {
                return;
            }
            self.elements.forEach((input) => {

                if (input.crudSetted == true) {
                    return
                }

                const collection = input.getAttribute('data-collection')
                const id = input.getAttribute('data-document_id')
                const name = input.getAttribute('name')
                const data_fetch_value = input.getAttribute('data-fetch_value');

                if (data_fetch_value === "false" || !CoCreateUtils.isReadValue(input)) return;

                if (data['collection'] == collection && data['document_id'] == id && (name in data.data)) {
                    // self.sendChangeData(input, data['data'][name], 0, data['data'][name].length, false);
                    CoCreate.replaceDataCrdt({
                        collection: collection,
                        document_id: id,
                        name: name,
                        value: data['data'][name],
                    })
                    input.crudSetted = true;
                }
            })
        })
    },

    setSelectionInfo: function (e, isSelect, start, end) {
        e.setAttribute("is_selected", isSelect);
        e.setAttribute("selection_start", start);
        e.setAttribute("selection_end", end);
        //console.log("swelect",e)
        this.sendPosition(e);
    },

    getSelectionInfo: function (e) {
        return {
            is_selected: (e.getAttribute("is_selected") === 'true') ? true : false,
            start: parseInt(e.getAttribute("selection_start")),
            end: parseInt(e.getAttribute("selection_end"))
        }
    },

    checkDocumentID: function (element) {
        let document_id = element.getAttribute('data-document_id');
        if (!document_id || document_id === "") {
            return false;
        }

        return true;
    },

    sendChangeData: function (element, content, start, end, isRemove = true) {

        if (!this.checkDocumentID(element)) {
            CoCreateDocument.requestDocumentId(element)
            element.setAttribute('data-document_id', 'pending');
            return;
        }

        if (element.getAttribute('data-document_id') == 'pending') {
            return;
        }

        const collection = element.getAttribute('data-collection'),
            document_id = element.getAttribute('data-document_id'),
            name = element.getAttribute('name');

        if (element.getAttribute('data-save_value') == 'false') {
            return;
        }
        if (content.length > 0) {

            if (isRemove) element.setRangeText("", start, start + content.length, "start")
            CoCreate.insertDataCrdt({
                collection, document_id, name,
                value: content,
                position: start
            })
        } else {
            if (isRemove) element.setRangeText(" ".repeat(end - start), start, start, "end")
            CoCreate.deleteDataCrdt({
                collection, document_id, name,
                position: start,
                length: end - start,
            })
        }

        if (document.activeElement === element)
            this.sendPosition(element);
    },

    updateChangeData: function (element, content, start, end) {

        let prev_start = element.selectionStart;
        let prev_end = element.selectionEnd;

        element.setRangeText(content, start, end, "end");

        if (prev_start >= start) {
            if (content == "") {
                prev_start -= end - start;
                prev_end -= end - start;
                prev_start = prev_start < start ? start : prev_start;
            } else {
                prev_start += content.length;
                prev_end += content.length;
            }
        } {
            if (content == "" && prev_end >= start) {
                prev_end = (prev_end >= end) ? prev_end - (end - start) : start
            }
        }

        element.selectionStart = prev_start;
        element.selectionEnd = prev_end;

        var isFocused = (document.activeElement === element);
        refresh_mirror(element);

        if (CoCreateFloatLabel) {
            CoCreateFloatLabel.update(element, element.value)
        }

    },

    generateTypeName: function (element) {
        var collection = element.getAttribute('data-collection');
        var document_id = element.getAttribute('data-document_id');
        var name = element.getAttribute('name');

        return CoCreateYSocket.generateID(config.organization_Id, collection, document_id, name);
    },

    setText: function (element_id, info) {
        var pos = 0;
        var flag = true;

        info.forEach(item => {
            if (item.retain) {
                flag = true;
                pos = item.retain;
            }

            if (item.insert || item.delete) {
                if (flag == false) pos = 0;
                flag = false;

                if (item.insert) {
                    //. insert process
                    this.receiveChangeData(element_id, item.insert, pos, pos)
                } else if (item.delete) {
                    //. delete process
                    this.receiveChangeData(element_id, "", pos, pos + item.delete);
                }

            }
        })
    },

    isAvaiableEl: function (element) {
        for (var i = 0; i < this.elements.length; i++) {
            if (this.elements[i].isEqualNode(element)) {
                return true;
            }
        }
        return false;
    },

    sendPosition: function (element) {
        if (!this.isAvaiableEl(element)) {
            return;
        }

        const id = this.generateTypeName(element);
        console.log(element.selectionStart, element.selectionEnd);
        let from = element.selectionStart;
        let to = element.selectionEnd;
        CoCreateCrdt.setPositionYJS(id, from, to);

    }
}


CoCreateText.init();
CoCreateInit.register('CoCreateText', CoCreateText, CoCreateText.initElement);

class CoCreateContentEditable {
    constructor() {
        this._elements = [];
        this._init();
        this.from = 0;
        this.to = 0;
    }

    _init(container) {
        let mainContainer = container || document;
        if (!mainContainer.querySelector) {
            return;
        }
        var elements = mainContainer.querySelectorAll("[contentEditable]:not([contentEditable='false'])");

        if (elements.length == 0 && mainContainer != document && mainContainer.hasAttribute('contentEditable')) {
            elements = [mainContainer];
        }

        for (var el of elements) {
            if (CoCreateInit.getInitialized(el)) {
                continue;
            }
            CoCreateInit.setInitialized(el)
            this._initElement(el);
            this._elements.push(el);
        }
    }

    _initElement(el) {

        if (CoCreateDocument.checkID(el)) {
            el.innerHTML = "";
            this._initElementEvents(el);
            this._createYDoc(el);
            // CoCreate.initDataCrdt(this._getElementInfo(el));

        } else {

            let _this = this;
            el.addEventListener('set-document_id', function (e) {
                _this._initElementEvents(this);
                _this._createYDoc(this);
                // _this.sendChangeData(this, text_str, 0, text_str.length);
            });
        }
    }

    _initElementEvents(el) {
        var _this = this;
        el.addEventListener('select', function (e) {
            console.log('selection', e)
        });
        el.addEventListener('input', function (e) {
            // console.log(e.inputType, e);
            let selection_info = _this.getSelectionInfo(this);
            let nowstart = selection_info.start;
            let nowend = nowstart + 1;
            let content_text = "";
            let isUpdate = true;

            switch (e.inputType) {
                case 'deleteContentBackward':
                    nowstart--;
                    nowend--;
                    break;
                case 'deleteContentForward':
                    break;
                case 'insertLineBreak':
                    content_text = "\n";
                    nowend++;
                    break;
                case 'insertText':
                    content_text = e.data || "";
                    break;
                case 'deleteByCut':
                    nowend = nowstart;
                    break;
                default:
                    isUpdate = false;
                    break;
            }

            if (!isUpdate) return;

            if (selection_info.is_selected) {

                // let character_deleted = selection_info.start - selection_info.end;
                // recalculate_local_cursors(this,character_deleted)
                _this.sendChangeData(this, "", selection_info.start, selection_info.end);

                if (content_text.length > 0) {
                    _this.sendChangeData(this, content_text, nowstart, nowend);
                }
                _this.setSelectionInfo(this, false, this.selectionStart, this.selectionStart);
            } else {
                _this.sendChangeData(this, content_text, nowstart, nowend);
            }
        });

        el.addEventListener('paste', function (e) {
            let content_text = event.clipboardData.getData('Text');
            // let caret = _this._getCaretPosition(this);
            let selection_info = _this.getSelectionInfo(this);

            if (selection_info.start !== selection_info.end) {
                _this.sendChangeData(this, "", selection_info.start, selection_info.end, false);
            }

            _this.sendChangeData(this, content_text, selection_info.start, selection_info.end, false);
            event.preventDefault();
        });

        ////  Caret and Selection Status Changes
        el.addEventListener('keyup', function (e) {
            let arrows = [37, 38, 39, 40];
            if (arrows.indexOf(e.keyCode) != -1) {
                _this.sendPosition(this);
            }
        });
        el.addEventListener('keydown', function (e) {
            let arrows = [37, 38, 39, 40];
            if (arrows.indexOf(e.keyCode) != -1) {
                _this.sendPosition(this);
            }
            const pos = _this._getCaretPosition(el);
            _this.setSelectionInfo(el, pos.from != pos.to, pos.from, pos.to)
        });

        el.addEventListener('click', function (e) {
            _this.sendPosition(this);
        });
        el.addEventListener('blur', function (e) {
            _this.sendPosition(el, true);
        });

        el.addEventListener('cocreate-y-update', function (e) {
            var info = event.detail;
            var pos = 0;
            var flag = true;

            info.forEach(item => {
                if (item.retain) {
                    flag = true;
                    pos = item.retain;
                }

                if (item.insert || item.delete) {
                    if (flag == false) pos = 0;
                    flag = false;

                    if (item.insert) {
                        _this.insertData(this, item.insert, pos);
                    } else if (item.delete) {
                        _this.deleteData(this, pos, pos + item.delete);
                    }

                }
            });
        });
    }

    sendChangeData(element, content, start, end, isRemove = true) {

        if (!this._checkConetentEditable(element)) return;

        if (element.getAttribute('data-document_id') == 'pending') {
            return;
        }

        const collection = element.getAttribute('data-collection'),
            document_id = element.getAttribute('data-document_id'),
            name = element.getAttribute('name');

        if (element.getAttribute('data-save_value') == 'false') {
            return;
        }

        if (content.length > 0) {
            if (isRemove) {
                this.deleteData(element, start, start + content.length);
            }
            CoCreate.insertDataCrdt({
                collection, document_id, name,
                value: content,
                position: start,
                attributes: null
            })
        } else {

            if (isRemove) {
                this.insertData(element, " ".repeat(end - start), start)
            }
            CoCreate.deleteDataCrdt({
                collection, document_id, name,
                position: start,
                length: end - start,
            })
        }
    }
    setSelectionInfo(e, isSelect, start, end) {
        e.setAttribute("is_selected", isSelect);
        e.setAttribute("selection_start", start);
        e.setAttribute("selection_end", end);
        this.sendPosition(e);
    }

    getSelectionInfo(e) {
        return {
            is_selected: (e.getAttribute("is_selected") === 'true') ? true : false,
            start: parseInt(e.getAttribute("selection_start")),
            end: parseInt(e.getAttribute("selection_end"))
        }
    }

    sendPosition(el, isClear) {
        if (!this._checkConetentEditable(el)) return;

        var curRange = this._getCaretPosition(el);
        var _json = this._getElementInfo(el);

        if (curRange && !isClear) {
            _json['startPosition'] = curRange.from;
            _json['endPositon'] = curRange.to;

            CoCreate.sendPosition(_json);
        } else {
            var _id = this._generateElementID(el);
            CoCreateCrdt.setCursorNull(_id);
        }
    }
    //////

    _getElementInfo(el) {
        return {
            collection: el.getAttribute('data-collection') || '_',
            document_id: el.getAttribute('data-document_id') || '_',
            name: el.getAttribute('name') || '_'
        };
    }

    _createYDoc(el) {
        const status = CoCreate.initDataCrdt({
            collection: el.getAttribute('data-collection'),
            document_id: el.getAttribute('data-document_id'),
            name: el.getAttribute('name'),
            element: el,
        })

        // this.setInitValue(el);
        // this.elements.push(el)
    }

    _generateElementID(el) {
        var _eInfo = this._getElementInfo(el);
        return CoCreateYSocket.generateID(config.organization_Id, _eInfo.collection, _eInfo.document_id, _eInfo.name);
    }

    _checkDocumentID(el) {
        let document_id = el.getAttribute('data-document_id');
        if (!document_id || document_id === "") return false;

        return true;
    }

    _checkConetentEditable(el) {
        if (!el.isContentEditable) return false;

        for (var _el of this._elements) {
            if (el.isSameNode(_el)) return true;
        }

        this._initElement(el);
        this._elements.push(el);
        return true;
    }

    _getCaretPosition(el) {
        if (document.activeElement !== el) return null;

        var selection = document.getSelection();
        if (!selection.rangeCount) return null;

        var _range = selection.getRangeAt(0);
        var selected = _range.toString().length;
        var range = _range.cloneRange();
        range.selectNodeContents(el);
        range.setEnd(_range.endContainer, _range.endOffset);

        var to = range.toString().length;
        var from = selected ? to - selected : to;

        return { from: from, to: to };
    }

    _setCaretPosition(el, from, to) {
        if (document.activeElement !== el) return;

        var selection = document.getSelection();
        var range = this._cloneRangeByPosition(el, from, to);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    _cloneRangeByPosition(el, from, to, range) {
        if (!range) {
            range = document.createRange();
            range.selectNode(el);
            range.setStart(el, 0);
            this.from = from;
            this.to = to;
        }

        if (el && (this.from > 0 || this.to > 0)) {
            if (el.nodeType === Node.TEXT_NODE) {

                if (el.textContent.length < this.from) this.from -= el.textContent.length;
                else if (this.from > 0) {
                    range.setStart(el, this.from);
                    this.from = 0;
                }

                if (el.textContent.length < this.to) this.to -= el.textContent.length;
                else if (this.to > 0) {
                    range.setEnd(el, this.to);
                    this.to = 0;
                }
            } else {
                for (var lp = 0; lp < el.childNodes.length; lp++) {
                    range = this._cloneRangeByPosition(el.childNodes[lp], this.from, this.to, range);
                    if (this.from === 0 && this.to === 0) break;
                }
            }
        }

        return range;
    }

    _getPositionFromRange(el, range) {
        var _range = document.createRange();
        _range.selectNodeContents(el);

        var from = 0, to = 0;

        _range.setEnd(range.endContainer, range.endOffset);
        to = _range.toString().length;

        _range.setEnd(range.startContainer, range.startOffset);
        from = _range.toString().length;

        return { from: from, to: to };
    }



    insertData(el, content, position) {
        if (!content || content === '') return;

        var selection = window.getSelection();
        var curCaret = this._getCaretPosition(el);

        var range = this._cloneRangeByPosition(el, position, position);
        var tmp = document.createElement("div");
        var frag = document.createDocumentFragment(), node;

        tmp.innerHTML = content;

        while ((node = tmp.firstChild)) {
            frag.appendChild(node);
        }
        range.insertNode(frag);

        if (!curCaret) {
            selection.addRange(range);
            selection.removeRange(range);
            return;
        }

        var pos = this.selectionProcessing(content, curCaret.from, curCaret.to, position, position);

        this._setCaretPosition(el, pos.start, pos.end);

        this.sendPosition(el);
    }

    deleteData(el, start, end) {
        var content_length = end - start;
        if (!content_length) return;
        var curCaret = this._getCaretPosition(el);
        var selection = window.getSelection();
        var range = this._cloneRangeByPosition(el, start, end);
        if (range) range.deleteContents();


        if (!curCaret) {
            selection.removeRange(range);
            return;
        }

        // if (!curCaret) return;
        var pos = this.selectionProcessing("", curCaret.from, curCaret.to, start, end);

        this._setCaretPosition(el, pos.start, pos.end);
        this.sendPosition(el);
    }

    selectionProcessing(content, prev_start, prev_end, start, end) {
        if (prev_start >= start) {
            if (content == "") {
                prev_start -= end - start;
                prev_end -= end - start;
                prev_start = prev_start < start ? start : prev_start;
            } else {
                prev_start += content.length;
                prev_end += content.length;
            }
        } {
            if (content == "" && prev_end >= start) {
                prev_end = (prev_end >= end) ? prev_end - (end - start) : start
            }
        }
        return { start: prev_start, end: prev_end };
    }

}

var g_CoCreateContentEditable = new CoCreateContentEditable();

CoCreateInit.register('CoCreateText', g_CoCreateContentEditable, g_CoCreateContentEditable._init);

// Sidenav
var sidenavs = document.querySelectorAll('.cocreate-sidenav');

for (var i = 0; i < sidenavs.length; i++) {
    initialiseSideNav(sidenavs[i]);
}

function initialiseSideNav(sidenav) {

    var device = '';
    var handler;
    var main_contents;


    ////   default values
    var sidenavSize = {
        expanded: '250px',
        collapsed: '50px',
        offcanvas: '0px',
    }

    var sidenavDefault = {
        desktop: "expanded",	 // offcanvas/collapsed/expanded/
        tablet: "collapsed",	 // offcanvas/collapsed/expanded
        phone: "offcanvas",	 // offcanvas/collapsed/expanded/
    }

    var sidenavDefaultValues = ['offcanvas', 'collapsed', 'expanded'];




    var sidenavOnToggle = {
        desktop: "collapsed",	 // offcanvas/collapsed/expanded/
        tablet: "expanded",	   // offcanvas/collapsed/expanded/
        phone: "expanded",	   // offcanvas/collapsed/expanded/
    }

    var sidenavOnToggleValues = ['offcanvas', 'collapsed', 'expanded'];



    var sidenavEffect = {
        desktop: "shrink",	 // shrink, overlay, none
        tablet: "shrink",	 // shrink, overlay, none
        phone: "overlay",	     // shrink, overlay, none
    }

    var sidenavEffectValues = ["shrink", "overlay", "none"];



    var status;              /////  availabe status: 'collapsed', 'expanded', 'offcanvas', 'resized', 'expandedOnHover'
    var expandOnHover = sidenav.getAttribute('expandOnHover') == 'false' ? false : true;

    var backdrop;


    getSidenavAttributes();
    getMainContents();
    initializeDevice();
    initializeSideNavHandler();
    initToggleTrigger();
    initializeHoverEffect();
    initMenuItems();
    //applyWidth();

    window.addEventListener('resize', initializeDevice, false);

    function getSidenavAttributes() {
        console.log('sidenav attributes');

        //// sidenav default
        var sidenav_default_desktop = sidenav.getAttribute('sidenav-default_desktop');
        var sidenav_default_tablet = sidenav.getAttribute('sidenav-default_tablet');
        var sidenav_default_phone = sidenav.getAttribute('sidenav-default_phone');
        var sidenav_default_expand_width = sidenav.getAttribute('sidenav-expanded_width');
        var sidenav_default_collapse_width = sidenav.getAttribute('sidenav-collapsed_width');

        console.log(sidenav_default_desktop);

        if (sidenavDefaultValues.indexOf(sidenav_default_desktop) > -1) {
            sidenavDefault['desktop'] = sidenav_default_desktop;
        }

        if (sidenavDefaultValues.indexOf(sidenav_default_tablet) > -1) {
            sidenavDefault['tablet'] = sidenav_default_tablet;
        }

        if (sidenavDefaultValues.indexOf(sidenav_default_phone) > -1) {
            sidenavDefault['phone'] = sidenav_default_phone;
        }

        if (sidenav_default_expand_width) {
            sidenavSize['expanded'] = sidenav_default_expand_width;
        }

        if (sidenav_default_collapse_width) {
            sidenavSize['collapsed'] = sidenav_default_collapse_width;
        }


        ////  sidenav toggle
        var sidenav_ontoggle_desktop = sidenav.getAttribute('sidenav-ontoggle_desktop');
        var sidenav_ontoggle_tablet = sidenav.getAttribute('sidenav-ontoggle_tablet');
        var sidenav_ontoggle_phone = sidenav.getAttribute('sidenav-ontoggle_phone');


        if (sidenavOnToggleValues.indexOf(sidenav_ontoggle_desktop) > -1) {
            sidenavOnToggle['desktop'] = sidenav_ontoggle_desktop;

            console.log(sidenavOnToggle);
        }

        if (sidenavOnToggleValues.indexOf(sidenav_ontoggle_tablet) > -1) {
            sidenavOnToggle['tablet'] = sidenav_ontoggle_tablet;

            console.log(sidenavOnToggle);
        }

        if (sidenavOnToggleValues.indexOf(sidenav_ontoggle_phone) > -1) {
            sidenavOnToggle['phone'] = sidenav_ontoggle_phone;

            console.log(sidenavOnToggle);
        }




        /////  sidenav effect

        var sidenav_effect_desktop = sidenav.getAttribute('sidenav-effect_desktop');
        var sidenav_effect_tablet = sidenav.getAttribute('sidenav-effect_tablet');
        var sidenav_effect_phone = sidenav.getAttribute('sidenav-effect_phone');


        if (sidenavEffectValues.indexOf(sidenav_effect_desktop) > -1) {
            sidenavEffect['desktop'] = sidenav_effect_desktop
        }

        if (sidenavEffectValues.indexOf(sidenav_effect_tablet) > -1) {
            sidenavEffect['tablet'] = sidenav_effect_tablet
        }

        if (sidenavEffectValues.indexOf(sidenav_effect_phone) > -1) {
            sidenavEffect['phone'] = sidenav_effect_phone
        }






    }

    function initializeSideNavHandler() {
        handler = sidenav.querySelector('.resizeHandler');
        if (handler) {
            handler.addEventListener('mousedown', initialiseResize, false);
            handler.addEventListener('touchstart', initialiseResizeTouch, false);
        }


        function initialiseResize(e) {
            console.log('initializeResize');
            window.addEventListener('mousemove', startResizing, false);
            window.addEventListener('mouseup', stopResizing, false);

            let iframes = document.getElementsByTagName('iframe');

            for (let i = 0; i < iframes.length; i++) {
                let iframe = iframes[i];

                initializeIframe(iframe, false, null);

                let childIframes = iframe.contentDocument.getElementsByTagName('iframe');

                for (let j = 0; j < childIframes.length; j++) {
                    initializeIframe(childIframes[j], true, iframe);
                }
            }
        }

        function initializeIframe(iframe, isChild, parentIframe) {
            if (isChild) {
                iframe.contentWindow.addEventListener('mousemove', function (e) {
                    let clRect = iframe.getBoundingClientRect();
                    let parentClRect = parentIframe.getBoundingClientRect();

                    let clientX = e.clientX + clRect.left + parentClRect.left;
                    let clientY = e.clientY + clRect.top + parentClRect.top;

                    window.dispatchEvent(new MouseEvent('mousemove', { "clientX": clientX, "clientY": clientY }));
                });
            } else {
                iframe.contentWindow.addEventListener('mousemove', function (e) {
                    let clRect = iframe.getBoundingClientRect();

                    let clientX = e.clientX + clRect.left;
                    let clientY = e.clientY + clRect.top;

                    window.dispatchEvent(new MouseEvent('mousemove', { "clientX": clientX, "clientY": clientY }));
                });
            }

            iframe.contentWindow.addEventListener('mouseup', function (e) {
                window.dispatchEvent(new MouseEvent('mouseup'));
            });
        }

        function initialiseResizeTouch(e) {
            console.log('touchstart');
            window.addEventListener('touchmove', startResizingTouch, false);
            window.addEventListener('touchend', stopResizingTouch, false);
        }

        function startResizing(e) {
            console.log('startResizing');
            if (sidenav.classList.contains('sidenav-right')) {
                sidenav.style.width = sidenav.offsetWidth - (e.clientX - sidenav.offsetLeft) + 'px';
            } else {
                sidenav.style.width = (e.clientX - sidenav.offsetLeft) + 'px';

            }

            status = 'resized';

            changeMainContent();

            //box.style.height = (e.clientY - box.offsetTop) + 'px';
        }

        function startResizingTouch(e) {
            if (sidenav.classList.contains('sidenav-right')) {
                sidenav.style.width = sidenav.offsetWidth - (e.touches[0].clientX - sidenav.offsetLeft) + 'px';
            } else {
                sidenav.style.width = (e.touches[0].clientX - sidenav.offsetLeft) + 'px';

            }

            status = 'resized';

            changeMainContent();
        }


        function stopResizing(e) {
            console.log('stopResizing');
            window.removeEventListener('mousemove', startResizing, false);
            window.removeEventListener('mouseup', stopResizing, false);
        }

        function stopResizingTouch(e) {
            window.removeEventListener('touchmove', startResizingTouch, false);
            window.removeEventListener('touchend', stopResizingTouch, false);
        }

    }

    function initializeDevice() {
        var screenSize = window.innerWidth;

        var orinalDevice = device;

        if (screenSize >= 1024) {
            device = 'desktop'
        } else if (screenSize < 1024 && screenSize > 768) {
            device = 'tablet';
        } else {
            device = 'phone';
        }

        if (orinalDevice != device) {
            applyWidth();
        }


    }

    function collapsed() {
        sidenav.style.width = sidenavSize.collapsed;
        status = 'collapsed';

        changeMainContent();
    }

    function offcanvas() {
        sidenav.style.width = sidenavSize.offcanvas;
        status = 'offcanvas';

        changeMainContent();
    }

    function expanded() {
        sidenav.style.width = sidenavSize.expanded;
        status = 'expanded';

        changeMainContent();
    }

    function applyWidth() {
        switch (sidenavDefault[device]) {
            case 'collapsed':
                collapsed(); break;
            case 'expanded':
                expanded(); break;
            case 'offcanvas':
                offcanvas(); break;
            default:
                break;
        }
    }

    function toggleSideNav() {
        if (status == sidenavDefault[device]) {      ///// if default
            switch (sidenavOnToggle[device]) {
                case 'collapsed':
                    collapsed(); break;
                case 'expanded':
                    expanded(); break;
                case 'offcanvas':
                    offcanvas(); break;
                default:
                    break;
            }
        } else {
            switch (sidenavDefault[device]) {
                case 'collapsed':
                    collapsed(); break;
                case 'expanded':
                    expanded(); break;
                case 'offcanvas':
                    offcanvas(); break;
                default:
                    break;
            }
        }
    }

    function initToggleTrigger() {
        var sidenavId = sidenav.id;
        var toggleTrigger = document.querySelector("[data-toggle_sidenav='" + sidenavId + "']");

        if (toggleTrigger) {
            toggleTrigger.addEventListener('click', toggleSideNav, false)
        }
    }

    function getMainContents() {
        var mainContentId = sidenav.getAttribute('data-main_content');

        if (mainContentId) {
            var array_mainContentId = mainContentId.split(',');
            var contentSelectors = array_mainContentId.reduce((a, b) => { return a + (a == '' ? '' : ',') + "[data-main_content_id='" + b + "']" }, '');
            main_contents = document.querySelectorAll(contentSelectors);
        }
    }

    function changeMainContent() {
        if (sidenavEffect[device] == 'shrink' || sidenavEffect[device] == 'none') {

            for (var i = 0; i < main_contents.length; i++) {
                var main_content = main_contents[i];

                if (sidenav.classList.contains('sidenav-right')) {
                    main_content.style.marginRight = sidenav.offsetWidth + 'px';
                } else {
                    main_content.style.marginLeft = sidenav.offsetWidth + 'px';
                }
            }
        } else if (sidenavEffect[device] == 'overlay') {
            for (var i = 0; i < main_contents.length; i++) {
                var main_content = main_contents[i];
                if (sidenav.classList.contains('sidenav-right')) {
                    main_content.style.marginRight = '0px';
                } else {
                    main_content.style.marginLeft = '0px';
                }
            }

            changeBackdrop();
        }
    }

    function initializeHoverEffect() {
        if (expandOnHover) {
            sidenav.addEventListener('mouseover', expandOnMouseOver, false)
        }

        function expandOnMouseOver() {
            if (status == 'collapsed') {
                expanded();
                status = 'expandedOnHover';
                sidenav.addEventListener('mouseout', collapseOnMouseOut, false);
            }
        }

        function collapseOnMouseOut() {
            sidenav.removeEventListener('mouseout', collapseOnMouseOut, false);
            if (status = 'expandedOnHover') collapsed();
        }
    }

    function initMenuItems() {
        sidenav.addEventListener('click', function (e) {

            for (let i = 0; i < e.path.length; i++) {
                let tag = e.path[i];

                if (tag.classList && tag.classList.contains('menuItem')) {
                    clickedMenuItem(); continue;
                }
            }
        });

        function clickedMenuItem() {
            console.log('clicked menuItem');

            applyWidth();
        }
    }

    function changeBackdrop() {
        console.log(sidenav.style.width);

        if (sidenav.style.width != '0px') {
            createBackdrop();
        } else {
            console.log('remove backdrop');
            removeBackdrop();
        }

        function createBackdrop() {
            backdrop = document.createElement('div');
            backdrop.classList.add('backdrop');
            backdrop.setAttribute("style", "position: fixed; z-index: 8; background-color: rgba(0,0,0,0.5); width: 100vw; height: 100vh; bottom: 0;");

            document.body.appendChild(backdrop);

            backdrop.addEventListener('click', function () {
                removeBackdrop();
                toggleSideNav();
            });
        }

        function removeBackdrop() {
            if (backdrop) backdrop.remove();
        }
    }

}

// Menu Toggle
var navToggles = document.querySelectorAll('.nav-toggle');
for (var i = 0; i < navToggles.length; i++) {
    var navToggle = navToggles[i];
    navToggle.addEventListener('click', function () {
        this.classList.toggle('open')
    })
}
/*!
* https://cocreate.app
* https://github.com/CoCreate-app/Icon_Transform
* Released under the MIT license
* https://github.com/CoCreate-app/Icon_Transform/blob/master/LICENSE
//*/

//var list_icon_transform = document.querySelectorAll("i[data-transform_to]")
//for (var icon of list_icon_transform) {
//     icon.addEventListener("click", function(e) {
// 		if(typeof this.dataset.transform_to != 'undefined'){
// 			var transform_to = this.dataset.transform_to;
// 			var class_name = this.className;
// 			this.className = transform_to;
// 			this.dataset.transform_to = class_name;
// 		}
// 		e.preventDefault();
//     });
//}

document.addEventListener('click', function (e) {
    if (e.target && e.target.tagName == "I" && e.target.getAttribute('data-transform_to')) {
        let t_icon = e.target;

        if (typeof t_icon.dataset.transform_to != 'undefined') {
            var transform_to = t_icon.dataset.transform_to;
            var class_name = t_icon.className;
            t_icon.className = transform_to;
            t_icon.dataset.transform_to = class_name;
        }
        e.preventDefault();

    }
})

/*!
* https://cocreate.app
* https://github.com/CoCreate-app/Fullscreen_Toggle
* Released under the MIT license
* https://github.com/CoCreate-app/Fullscreen_Toggle/blob/master/LICENSE
*/

var requestFullscreen = function (ele) {
    if (!document.fullscreenElement) {
        if (ele.requestFullscreen) {
            ele.requestFullscreen();
        } else if (ele.webkitRequestFullscreen) {
            ele.webkitRequestFullscreen();
        } else if (ele.mozRequestFullScreen) {
            ele.mozRequestFullScreen();
        } else if (ele.msRequestFullscreen) {
            ele.msRequestFullscreen();
        } else {
            console.log('Fullscreen API is not supported.');
        }
    }
};
var exitFullscreen = function (item) {
    if (document.fullscreenElement) {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        } else {
            console.log('Fullscreen API is not supported.');
        }
        //FullscreenItem(item)
    }
};
var FullscreenItem = function (item) {
    //item = event.target;
    var target = item.getAttribute("target") == null ? document.documentElement : document.querySelector(item.getAttribute("target"))
    //console.log('target => ',target)
    requestFullscreen(target);
}

Boolean.parse = function (str) {
    switch (str.toLowerCase()) {
        case "true":
            return true;
        case "false":
            return false;
        default:
            return false;
        //throw new Error ("Boolean.parse: Cannot convert string to boolean.");
    }
};

let list_fs_target_button = document.querySelectorAll('[data-fullscreen]');

document.addEventListener('fullscreenchange', (event) => {
    //list_fs_target_button_true = document.querySelectorAll('[data-fullscreen="true"]');
    let list_fs_target_button_true = document.querySelectorAll('[data-fullscreen="true"]');
    list_fs_target_button_true.forEach(elem => {
        //elem.dataset['fullscreen'] = document.fullscreenElement!=null
        console.log("evetn ", document.fullscreenElement)
        if (document.fullscreenElement == null) {
            console.log("LOG fullscreen")
            elem.dataset['fullscreen'] = false
        }
    });
});

for (let item of list_fs_target_button) {
    item.addEventListener("click", function (event) {
        console.log("primero ", item.dataset['fullscreen'])
        if (document.fullscreenElement == null)
            item.dataset['fullscreen'] = false
        var action = typeof item.dataset['fullscreen'] != 'undefined' ? Boolean.parse(item.dataset['fullscreen']) : false
        console.log("action ", action)
        /*list_fs_target_button.forEach(elem =>{
          elem.dataset['fullscreen'] = !action
        })*/
        item.dataset['fullscreen'] = !action
        console.log("primero ", item.dataset['fullscreen'])
        if (!action) {
            FullscreenItem(item)
        }
        else {
            exitFullscreen(item);
        }
    });
}

"use strict";

window.mobilecheck = function () {
    var check = false;
    (function (a) { if (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0, 4))) check = true; })(navigator.userAgent || navigator.vendor || window.opera);
    return check;
};

function CoCreateModal(el, options, container) {
    if (!(el && el.nodeType && el.nodeType === 1)) {
        return;
    }

    /** define constant **/
    this.MARGIN = 5;
    this.FULLSCREEN_MARGIN = -20;
    this.NO_SNAP = -31;
    this.SNAP_MARGIN = -10;

    this.RIGHT_SCROL = 5;

    // 	if (window.mobilecheck()) {
    // 	  this.MARGIN = 20;
    // 	}

    /** options **/
    let defaults = {
        minWidth: 60,
        minHeight: 40,
    };

    this.id = CoCreateWindow.generateUUID(20);
    this.el = el;
    this.clicked = null;
    this.redraw = false;

    this.boundStatus = {};

    /**
     * x: mouse x in element
     * y: mouse y in element
     * cx: x in document
     * cy: y in document
     * */
    this.point = {};
    this.rect = {};
    this.clickedInfo = null;
    this.preSnapped = null;
    this.prevRect = {};
    this.isSnap = false;
    this.isHeader = true;

    this.dragArea = null;
    this.headerArea = null;

    this.width = 0;
    this.height = 0;
    this.isParked = false;

    this.iframe = null;
    this.container = container;


    this.options = Object.assign(defaults, options);

    this.el.setAttribute("id", this.id);

    CoCreateStorage.pageId = this.id;

    this._init();
    this._setModalSize();
    this._initEvent();
    this._animate();

}

CoCreateModal.prototype = {
    constructor: CoCreateModal,

    _init: function () {
        var opt = this.options;

        this.isAjax = opt.ajax ? opt.ajax : this.el.getAttribute("data-modal_ajax")
        var windowURL = opt.url ? opt.url : this.el.getAttribute("href");
        var width = opt.width ? opt.width : this.el.getAttribute("data-modal_width");
        var height = opt.height ? opt.height : this.el.getAttribute("data-modal_height");
        var color = opt.color ? opt.color : this.el.getAttribute("data-modal_color");
        var x = opt.x ? opt.x : this.el.getAttribute("data-modal_x")
        var y = opt.y ? opt.y : this.el.getAttribute("data-modal_y")
        var showHeader = opt.header ? opt.header : this.el.getAttribute("data-modal_header")

        //. set default
        // this.el.style.width = "300px";
        // this.el.style.height = "100%";
        // this.el.style.left = 0;
        // this.el.style.right = 0;
        // this.el.style.borderColor = "#888";

        if (width && width != "") {
            this.el.style.width = width;
        } else {
            this.el.style.width = "600px";
        }
        if (height && height != "") {
            this.el.style.height = height;
        } else {
            this.el.style.height = "100%";
        }

        if (this.el.parentElement.clientWidth < this.el.clientWidth) {
            this.el.style.width = "100%"
        }
        if (this.el.parentElement.clientHeight < this.el.clientHeight) {
            this.el.style.width = "100%"
        }


        if (x && x != "") {
            this.el.style.left = x;
        } else {
            this.el.style.left = (this.el.parentElement.clientWidth - this.el.offsetWidth) / 2;
        }
        if (y && y != "") {
            this.el.style.top = y;
        } else {
            this.el.style.top = "0px";
        }
        if (color && color !== "") this.el.style.borderColor = color;

        if (showHeader == "true") {
            this.isHeader = true;
            this._createTitle();
        } else {
            this.isHeader = false;
            this._createDragArea();
        }

        this.el.innerHTML = this.el.innerHTML + `<div class="parked-closeBtn"><i class="fas fa-times closeBtn"></i></div>`;


        if (windowURL && windowURL != "") {
            var iframe = document.createElement("iframe");
            iframe.style.width = "100%"; // calc(100% - 4px);
            iframe.style.height = "100%";
            if (this.headerArea) {
                // iframe.style.height = "calc( 100% - " + (this.headerArea.clientHeight + 5) + "px )";
                iframe.style.height = "calc( 100% - 45px)";
            }
            iframe.src = windowURL;
            this.el.appendChild(iframe)
            this.iframe = iframe;
        }
    },

    _initEvent: function () {
        let _this = this;

        if (this.iframe) {
            this.iframe.addEventListener('load', function () {
                console.log(_this.iframe.contentDocument);
                const iframeContent = _this.iframe.contentDocument;
                const nav = iframeContent.querySelector('.nav');

                iframeContent.addEventListener('click', function () {
                    var event = new CustomEvent("cocreate-selectmodal", { detail: { modal: _this } });
                    _this.el.parentNode.dispatchEvent(event);
                })
            });
        }

        this.el.addEventListener("click", function (e) {
            var event = new CustomEvent("cocreate-selectmodal", { detail: { modal: _this } });
            _this.el.parentNode.dispatchEvent(event);
        }, true)

        this.el.addEventListener("dblclick", function (e) {
            if (_this.isParked) {
                _this.isParked = false;
                _this.el.classList.remove("modal-parked");
            }
        })

        this.el.addEventListener('modal-resizing', function (e) {
            console.log('resizing event trigger')
        })
        this.el.addEventListener('touchstart', function (e) {
            _this.changeRightDragEl(true);
            var event = new CustomEvent("cocreate-selectmodal", { detail: { modal: _this } });
            _this.el.parentNode.dispatchEvent(event);
            _this._onDown(e.touches[0]);
            console.log('--------------------------------')
            // e.preventDefault();
        })

        this.el.addEventListener('mousemove', function (e) {
            _this.changeRightDragEl(false);
        })

        this.el.addEventListener('mousedown', function (e) {

            var event = new CustomEvent("cocreate-selectmodal", { detail: { modal: _this } });
            _this.el.parentNode.dispatchEvent(event);
            _this._onDown(e);
        })

        this.el.addEventListener('mouseup', function (e) {
            // _this.changeRightDragEl(true);
        })

        this._addButtonEvent()
        this.el.addEventListener("modal-resizeend", function (e) {
            _this._saveFetch();
            // _this.changeRightDragEl(true);

        });

        this.el.addEventListener("modal-moveend", function (e) {
            _this._saveFetch();
            // _this.changeRightDragEl(true);

        })
    },

    changeRightDragEl: function (isRevert = true) {
        const right_el = this.el.querySelector('.modal-drag-area-right')

        const size = isRevert ? "0px" : "-10px"
        if (right_el) {
            right_el.style.right = size;
        }
        this.RIGHT_SCROL = !isRevert ? 0 : 5;

    },

    _addButtonEvent: function () {
        var _this = this;
        if (this.el.querySelector(".modal-title-area .closeBtn")) {
            this.el.querySelector(".modal-title-area .closeBtn").addEventListener("click", function (e) {
                e.preventDefault();
                _this.el.parentNode.dispatchEvent(new CustomEvent("cocreate-removemodal", { detail: { modal: _this } }));
            })
        }

        if (this.el.querySelector(".parked-closeBtn .closeBtn")) {
            this.el.querySelector(".parked-closeBtn .closeBtn").addEventListener("click", function (e) {
                e.preventDefault();
                _this.el.parentNode.dispatchEvent(new CustomEvent("cocreate-removemodal", { detail: { modal: _this } }));
            })
        }

        if (this.el.querySelector(".modal-title-area .maximizeBtn")) {
            this.el.querySelector(".modal-title-area .maximizeBtn").addEventListener("click", function (e) {
                e.preventDefault();
                _this._setMaximize();
            })
        }

        if (this.el.querySelector(".modal-title-area .minimizeBtn")) {
            this.el.querySelector(".modal-title-area .minimizeBtn").addEventListener("click", function (e) {
                e.preventDefault();
                _this.togglePark()
            })
        }

        // if (this.el.querySelector(".modal-title-area .parkBtn")) {
        //   this.el.querySelector(".modal-title-area .parkBtn").addEventListener("click", function(e) {
        //     _this.togglePark()
        //   })
        // }
    },

    togglePark: function () {

        if (this.isParked) {
            this.isParked = false;
            this.el.classList.remove("modal-parked");
        } else {
            this.isParked = true;
            this.el.classList.add("modal-parked")
        }
    },

    _setModalSize: function () {
        let bound = this.el.getBoundingClientRect();
        let parentBound = this.el.parentNode.getBoundingClientRect();
        this.width = bound.width;
        this.height = bound.height;

        this.el.style.left = bound.left - parentBound.left;
        this.el.style.top = bound.top - parentBound.top;
    },

    _saveFetch: function () {
        if (this.el.classList.contains("domEditor")) {
            // saveHtml(this.el);
            CoCreateHtmlTags.save(this.el);
        }
    },

    _onMove: function (e) {
        const data = this._getBoundStatus(e)
        this.redraw = true;
    },

    _onDown: function (e) {
        //. set clicked

        this._getBoundStatus(e);

        var isResizing = this.boundStatus.isRight || this.boundStatus.isLeft || this.boundStatus.isTop || this.boundStatus.isBottom;

        this.clickedInfo = {
            x: this.point.x,
            y: this.point.y,
            cx: this.point.cx,
            cy: this.point.cy,
            w: this.rect.width,
            h: this.rect.height,
            isResizing: isResizing,
            isMoving: !isResizing && this._isMovable(),
            boundStatus: this.boundStatus,
            isChangeStart: true
        }
    },

    _onUp: function (e) {
        if (e) {
            this._getBoundStatus(e);
        }
        if (!this.clickedInfo) {
            return;
        }
        if (this.clickedInfo.isMoving && !this.isParked) {
            let p_w = this.el.parentNode.offsetWidth, p_h = this.el.parentNode.offsetHeight;
            let snap_info = null;

            if (this._between(this.rect.top, this.NO_SNAP, this.FULLSCREEN_MARGIN) ||
                this._between(this.rect.left, this.NO_SNAP, this.FULLSCREEN_MARGIN) ||
                this._between(p_w - this.rect.right, this.NO_SNAP, this.FULLSCREEN_MARGIN) ||
                this._between(p_h - this.rect.bottom, this.NO_SNAP, this.FULLSCREEN_MARGIN)) {
                snap_info = { x: 0, y: 0, w: '100%', h: '100%' }
            } else if (this._between(this.rect.top, this.NO_SNAP, this.SNAP_MARGIN)) {
                snap_info = { x: 0, y: 0, w: '100%', h: '50%' }
            } else if (this._between(this.rect.left, this.NO_SNAP, this.SNAP_MARGIN)) {
                snap_info = { x: 0, y: 0, w: '50%', h: '100%' }
            } else if (this._between(p_w - this.rect.right, this.NO_SNAP, this.SNAP_MARGIN)) {
                snap_info = { x: '50%', y: 0, w: '50%', h: '100%' }
            } else if (this._between(p_h - this.rect.bottom, this.NO_SNAP, this.SNAP_MARGIN)) {
                snap_info = { x: 0, y: '50%', w: '100%', h: '50%' }
            }

            if (snap_info && !this.isSnap) {
                this._setBound(this.el, snap_info.x, snap_info.y, snap_info.w, snap_info.h);
                this.preSnapped = { x: this.rect.x, y: this.rect.y, width: this.rect.width, height: this.rect.height };
                this.isSnap = true;
            }

            var ghost_info = {
                x: this.rect.x,
                y: this.rect.y,
                w: this.rect.width,
                h: this.rect.height
            }
            this.el.parentNode.dispatchEvent(new CustomEvent("cocreate-modalghost", { detail: ghost_info }));
        }

        if (this.clickedInfo.isResizing) {
            this.createModalEvent('modal-resizeend');
            this._setModalSize()
            this.isSnap = false;
        } else if (this.clickedInfo.isMoving) {
            this.createModalEvent('modal-moveend');
        }


        this.clickedInfo = null;
    },

    _setBound: function (el, x, y, w, h) {
        var borderHeight = this.el.offsetHeight - this.el.clientHeight;
        var borderWidth = this.el.offsetWidth - this.el.clientWidth;
        el.style.left = x;
        el.style.top = y;
        // el.style.width = "calc( " + w + " - " + borderWidth + "px )";
        // el.style.height = "calc( "  + h + " - " + borderHeight + "px )";
        el.style.width = w;
        el.style.height = h;
    },

    _setRectInfo: function () {
        let bound = this.el.getBoundingClientRect();
        let parentRect = this.el.parentNode.getBoundingClientRect();
        this.rect = {};
        this.rect.x = bound.x - parentRect.x;
        this.rect.y = bound.y - parentRect.y;
        this.rect.width = bound.width;
        this.rect.height = bound.height;
        this.rect.top = bound.top - parentRect.top;
        this.rect.bottom = bound.bottom - parentRect.top;
        this.rect.left = bound.left - parentRect.left;
        this.rect.right = bound.right - parentRect.left;
    },

    _getBoundStatus: function (e) {
        let bound = this.el.getBoundingClientRect();
        let parentRect = this.el.parentNode.getBoundingClientRect();
        let x = e.clientX - bound.left;// - parentRect.left;
        let y = e.clientY - bound.top;// - parentRect.top;

        this._setRectInfo();

        this.point.x = x;
        this.point.y = y;
        this.point.cx = e.clientX - parentRect.left;
        this.point.cy = e.clientY - parentRect.top;

        this.boundStatus = {
            isTop: y < this.MARGIN && y > -this.MARGIN,
            isLeft: x < this.MARGIN && x > -this.MARGIN,
            isRight: x >= bound.width - this.RIGHT_SCROL && x <= bound.width + this.MARGIN + (this.MARGIN - this.RIGHT_SCROL),
            isBottom: y >= bound.height - this.MARGIN && y <= bound.height + this.MARGIN
        }

        return this.boundStatus;
    },

    _between: function (x, min, max) {
        return x >= min && x <= max;
    },

    _animate: function () {
        let _this = this;
        requestAnimationFrame(function () {
            _this._animate();
        });

        if (!this.redraw) {
            return;
        }
        this.redraw = false;

        let c_info = this.clickedInfo;

        var eventName = null;

        /**
         * Resize process
         **/
        if (c_info && c_info.isResizing && !this.isParked) {
            if (c_info.boundStatus.isRight)
                this.el.style.width = Math.max(this.point.x, this.options.minWidth) + 'px';

            if (c_info.boundStatus.isBottom) {
                this.el.style.height = Math.max(this.point.y, this.options.minHeight) + 'px';
            }

            if (c_info.boundStatus.isLeft) {
                var c_width = Math.max(c_info.cx - this.point.cx + c_info.w, this.options.minWidth);
                if (c_width > this.options.minWidth) {
                    this.el.style.width = c_width + 'px';
                    this.el.style.left = this.point.cx + 'px';
                }
            }

            if (c_info.boundStatus.isTop) {
                var c_height = Math.max(c_info.cy - this.point.cy + c_info.h, this.options.minHeight);
                if (c_height > this.options.minHeight) {
                    this.el.style.height = c_height + 'px';
                    this.el.style.top = this.point.cy + 'px';
                }
            }

            eventName = "modal-resizing";
            if (c_info.isChangeStart) {
                this.clickedInfo.isChangeStart = false;
                eventName = "modal-resizestart";
            }
            this.createModalEvent(eventName)
            return;
        }

        if (c_info && c_info.isMoving) {
            /** 
             * Ghost Process
             **/

            let p_w = this.el.parentNode.offsetWidth, p_h = this.el.parentNode.offsetHeight;
            let ghost_info = null;

            if (this._between(this.rect.top, this.NO_SNAP, this.FULLSCREEN_MARGIN) ||
                this._between(this.rect.left, this.NO_SNAP, this.FULLSCREEN_MARGIN) ||
                this._between(p_w - this.rect.right, this.NO_SNAP, this.FULLSCREEN_MARGIN) ||
                this._between(p_h - this.rect.bottom, this.NO_SNAP, this.FULLSCREEN_MARGIN)) {
                ghost_info = { x: 0, y: 0, w: p_w, h: p_h, type: "show" }
            } else if (this._between(this.rect.top, this.NO_SNAP, this.SNAP_MARGIN)) {
                ghost_info = { x: 0, y: 0, w: p_w, h: p_h / 2, type: "show" }
            } else if (this._between(this.rect.left, this.NO_SNAP, this.SNAP_MARGIN)) {
                ghost_info = { x: 0, y: 0, w: p_w / 2, h: p_h, type: "show" }
            } else if (this._between(p_w - this.rect.right, this.NO_SNAP, this.SNAP_MARGIN)) {
                ghost_info = { x: p_w / 2, y: 0, w: p_w / 2, h: p_h, type: "show" }
            } else if (this._between(p_h - this.rect.bottom, this.NO_SNAP, this.SNAP_MARGIN)) {
                ghost_info = { x: 0, y: p_h / 2, w: p_w, h: p_h / 2, type: "show" }
            } else {
                ghost_info = { x: this.rect.left, y: this.rect.top, w: this.rect.width, h: this.rect.height, type: "hide" }
            }

            if (ghost_info && !this.isParked && !this.isSnap) {
                this.el.parentNode.dispatchEvent(new CustomEvent("cocreate-modalghost", { detail: ghost_info }));
            }

            if (this.isSnap) {
                // this.el.style.left = (this.point.cx - this.preSnapped.width / 2) + 'px';
                // this.el.style.top = (this.point.cy - Math.min(c_info.y, this.preSnapped.height)) + 'px';
                this.el.style.left = this.point.cx + 'px';
                this.el.style.top = this.point.cy + 'px';
                this.el.style.width = this.preSnapped.width + 'px';
                this.el.style.height = this.preSnapped.height + 'px';
                this.isSnap = false;
            } else {
                this.el.style.top = (this.point.cy - c_info.y) + 'px';
                this.el.style.left = (this.point.cx - c_info.x) + 'px';
            }

            eventName = "modal-moving";
            if (c_info.isChangeStart) {
                this.clickedInfo.isChangeStart = false;
                eventName = "modal-movestart";
            }

            this.createModalEvent(eventName)
            return;
        }

        this.redraw = false;
        this._setCursor(this.boundStatus);
    },

    _setMaximize() {
        if (!this.isSnap) {
            this.isSnap = true;
            this.preSnapped = { x: this.rect.x, y: this.rect.y, width: this.rect.width, height: this.rect.height };
            this._setBound(this.el, 0, 0, "100%", "100%");
        } else {
            this.isSnap = false;
            this.el.style.left = this.preSnapped.x + 'px';
            this.el.style.top = this.preSnapped.y + 'px';
            this.el.style.width = this.preSnapped.width + 'px';
            this.el.style.height = this.preSnapped.height + 'px';
        }

        // this.clickedInfo = null;
    },

    _setCursor(bound) {
        let cursor = "default";
        if (!this.isParked && bound.isRight && bound.isBottom || bound.isLeft && bound.isTop) cursor = 'nwse-resize';
        else if (!this.isParked && bound.isRight && bound.isTop || bound.isBottom && bound.left) cursor = 'nwsw-resize';
        else if (!this.isParked && bound.isRight || bound.isLeft) cursor = 'ew-resize';
        else if (!this.isParked && bound.isBottom || bound.isTop) cursor = 'ns-resize';
        else if (this._isMovable()) cursor = "move";
        this.el.style.cursor = cursor;
        this.setContainerEvent(cursor);


    },

    //. setParent Event
    setContainerEvent(status) {
        console.log(status)
        if (!this.container) return;
        if (status != 'default') {

            this.container.style.pointerEvents = "auto";
        } else {
            this.container.style.pointerEvents = "none";
        }
    },

    _isMovable() {
        var width = this.rect.width;
        if (this.isHeader) {
            width -= 120;
        }
        return this.point.x > 0 && this.point.x < width && this.point.y > 0 && this.point.y < 50
    },

    /**
     * Modal Events
     * resize: modal-resizing, modal-resizeend, modal-resizestart
     * move: modal-moving, modal-moveend, modal-movestart
     **/
    createModalEvent(eventName) {
        var event = new CustomEvent(eventName, {});
        this.el.dispatchEvent(event);
    },

    _createTitle: function (n) {
        var header_template = `<div class="nav bg-light-gray"><ul class="modal-title-area">
          <li><a class="minimizeBtn"><i class="far fa-window-minimize"></i></a></li>
          <li><a class="maximizeBtn"><i class="far fa-window-restore"></i></a></li>
         <!-- <li><a class="parkBtn"><i class="fas fa-dot-circle "></i></a></li> -->
          <li><a class="closeBtn"><i class="fas fa-times"></i></a></li>
      </ul></div>`;
        this.el.innerHTML = header_template + this.el.innerHTML;
        this.headerArea = this.el.querySelector('.modal-title-area');
    },

    _createDragArea: function () {
        this.dragArea = document.createElement("div");
        this.dragArea.classList.add("modal-drag-area");

        let left_area = document.createElement("div");
        left_area.classList.add("modal-drag-area-left");

        let right_area = document.createElement("div");
        right_area.classList.add("modal-drag-area-right");

        let bottom_area = document.createElement("div");
        bottom_area.classList.add("modal-drag-area-bottom");

        this.el.appendChild(this.dragArea);
        this.el.appendChild(left_area);
        this.el.appendChild(right_area);
        this.el.appendChild(bottom_area);
    },

    resize: function (dx, dy, width, height) {
        if (this.isSnap) {
            return;
        }

        var borderHeight = this.el.offsetHeight - this.el.clientHeight;
        var borderWidth = this.el.offsetWidth - this.el.clientWidth;

        width = width - borderWidth;
        height = height - borderHeight;
        /** left, right **/
        if (dx !== 0 && !this.isPercentDimesion(this.el.style.width)) {
            var el_width = this.el.offsetWidth;
            if (el_width + this.rect.left > width && dx < 0) {
                this.el.style.left = this._setDimension(Math.max(0, this.rect.left + dx));
            }
            this.el.style.width = this._setDimension(Math.min(el_width, width));
        }

        /** top, bottom **/
        if (dy !== 0 && !this.isPercentDimesion(this.el.style.height)) {
            var el_height = this.el.offsetHeight;
            if (el_height + this.rect.top > height && dy < 0) {
                this.el.style.top = this._setDimension(Math.max(0, this.rect.top + dy));
            }
            this.el.style.height = this._setDimension(Math.min(el_height, height));
        }

        this._setRectInfo()
    },

    _setDimension: function (data, isPercent) {
        if (isPercent) {
            return data + "%";
        } else {
            return data + "px";
        }
    },

    isPercentDimesion: function (dimension) {
        if (!dimension) return false;
        if (typeof dimension === 'string' && dimension.substr(-1, 1) === "%") {
            return true;
        }
        return false;
    }

}

/**
 * CoCreateModalContainer Object
 * 
 **/
function CoCreateModalContainer(el) {
    this.modals = [];

    this.el = el;
    this.modalClass = this.el.getAttribute("data-modal-class");
    this.SELECT_ZINDEX = 10;
    this.UNSELECT_ZINDEX = 2;
    this.ghostEl = null;
    this.width = 0;
    this.height = 0;

    this.selectedModal = null;

    if (!this.modalClass) {
        this.modalClass = "modal";
    }

    this._createGhost(this.el.getAttribute("data-ghost-class"));
    this._initModals();
    this._initEvent();

}

CoCreateModalContainer.prototype = {
    _createGhost: function (ghostClass) {
        var node = document.createElement("div");
        if (!ghostClass) {
            ghostClass = "modal-ghost";
        }

        node.classList.add(ghostClass);
        this.el.appendChild(node);
        this.ghostEl = node;
    },
    _initModals: function () {
        var el_children = document.querySelectorAll("." + this.modalClass);

        for (var i = 0; i < el_children.length; i++) {
            this.modals.push(new CoCreateModal(el_children[i], {}, this.el));
        }

        if (!this.selectedModal) {
            this._selectModal(this.modals[this.modals.length - 1]);

        }
    },

    _initEvent: function () {
        let _this = this;

        this.el.addEventListener('mousemove', function (e) {
            e.preventDefault();
            if (_this.selectedModal) {
                _this.selectedModal._onMove(e);
            }
        });

        this.el.addEventListener('mouseup', function (e) {
            if (_this.selectedModal) {
                _this.selectedModal._onUp(e);
            }
            e.preventDefault();
        }, true);

        this.el.addEventListener('touchmove', function (e) {
            // e.preventDefault();
            if (_this.selectedModal) {
                _this.selectedModal._onMove(e.touches[0]);
            }
        })

        this.el.addEventListener('touchend', function (e) {
            // e.preventDefault();
            if (_this.selectedModal) {
                _this.selectedModal._onUp(e.touches[0]);
            }
        })

        this.el.addEventListener('cocreate-selectmodal', function (e) {
            if (_this.selectedModal) {
                _this._selectModal(e.detail.modal);
            }
        })

        this.el.addEventListener('cocreate-modalghost', function (e) {
            if (_this.selectedModal) {
                _this._ghostProcess(e.detail)
            }
        })

        this.el.addEventListener('cocreate-removemodal', function (e) {
            if (_this.selectedModal) {
                _this._removeModal(e.detail.modal)
            }
        })
        this._initResizeEvent()
    },

    _initResizeEvent: function () {
        var _this = this;
        var bound = this.el.getBoundingClientRect();
        this.width = bound.width;
        this.height = bound.height;
        let ro = new ResizeObserver((entries, observer) => {
            let contentRect = entries[0].contentRect;
            _this._resizeProcess(_this.width, _this.height, contentRect.width, contentRect.height);
        })

        ro.observe(this.el)
    },

    _resizeProcess(prevWidth, prevHeight, width, height) {
        this.width = width;
        this.height = height;

        if (prevWidth == width && prevHeight == height) {
            return;
        }

        let dx = width - prevWidth;
        let dy = height - prevHeight;

        for (var i = 0; i < this.modals.length; i++) {
            this.modals[i].resize(dx, dy, width, height);
        }

    },

    _createModal: function (attr) {
        var node = document.createElement("div");
        node.classList.add(this.modalClass);
        node.style.zIndex = this.SELECT_ZINDEX;

        this.el.appendChild(node)

        var modal = new CoCreateModal(node, attr, this.el);
        this.modals.push(modal)

        this._selectModal(node);
    },

    _releaseSelect: function () {
        if (!this.selectedModal) {
            return;
        }
        this.selectedModal.el.style.zIndex = this.UNSELECT_ZINDEX;
        this.selectedModal.el.classList.remove("modal_selected");
        this.selectedModal = null;
    },

    _selectModal: function (el) {

        let modal = this._findModalByElement(el);
        if (modal == this.selectedModal) {
            return;
        }
        this._releaseSelect();

        this.selectedModal = modal;

        if (this.selectedModal) {
            this.selectedModal.el.style.zIndex = this.SELECT_ZINDEX;
            this.selectedModal.el.classList.add('modal_selected');
            this.ghostEl.style.width = 0;
            this.ghostEl.style.height = 0;
        }
    },

    _findModalByElement: function (el) {

        if (el instanceof CoCreateModal) {
            return el;
        }
        for (var i = 0; i < this.modals.length; i++) {
            if (this.modals[i].el.isEqualNode(el)) {
                return this.modals[i];
            }
        }

        return null;
    },

    getModalById: function (id) {
        for (var i = 0; i < this.modals.length; i++) {
            if (this.modals[i].id == id) {
                return this.modals[i];
            }
        }

        return null;
    },

    _ghostProcess: function (info) {
        this.ghostEl.style.left = info.x + 'px';
        this.ghostEl.style.top = info.y + 'px';
        this.ghostEl.style.width = info.w + 'px';
        this.ghostEl.style.height = info.h + 'px';

        if (info.type === "show") {
            if (this.ghostEl.style.display === 'none') {
                this.ghostEl.style.display = 'block'
            }
            this.ghostEl.style.opacity = 0.2;
        } else {
            this.ghostEl.style.opacity = 0;
            if (this.ghostEl.style.display !== 'none') {
                this.ghostEl.style.display = 'none'
            }
        }
        return;
    },

    _removeModal: function (modal) {
        for (var i = 0; i < this.modals.length; i++) {
            if (this.modals[i] === modal) {
                this.el.removeChild(modal.el);
                this.modals.splice(i, 1);
                break;
            }
        }
        if (this.modals.length > 0) {
            this._selectModal(this.modals[this.modals.length - 1]);
        } else {
            this.selectedModal = null;
        }
        this.el.style.pointerEvents = "none";
    }

}

/* ========================================================================= */

function CoCreateWindow(id) {
    let container_id = (id) ? id : 'modal-viewport';
    this.container = null;
    this.id = container_id;

    this.pageId = CoCreateWindow.generateUUID(20);
    this.isRoot = this._checkRoot();


    if (!this.isRoot) {
        this.parentId = CoCreateStorage.parentPageId;
        this.pageId = CoCreateStorage.pageId;
        this.rootId = CoCreateStorage.rootPageId;
    } else {
        CoCreateStorage.rootPageId = this.pageId;
        this.rootId = this.pageId;
        this.parentId = this.pageId;
    }

    this._createContainer();
    this._initButtons();
    this._initWndButtons();

    this._initSocket();

    //. set parent_id and page_id for test 

    var html = document.querySelector("html");
    html.setAttribute("test-parent_id", this.parentId);
    html.setAttribute("test-page_id", this.pageId);
}

CoCreateWindow.prototype = {
    _checkRoot: function () {
        try {
            return window.self === window.top;
        } catch (e) {
            return false;
        }
    },
    _createContainer: function () {
        if (this.container) {
            return true
        }


        var el = document.getElementById(this.id);

        if (el) {
            this.container = new CoCreateModalContainer(el);

            return true;
        } else {
            return false;
        }
    },
    _initButtons: function () {
        let btns = document.querySelectorAll('[target=modal][href]');
        var wnd_container = this.container;
        var _this = this;

        for (var i = 0; i < btns.length; i++) {

            btns[i].addEventListener('click', function (e) {
                e.preventDefault();
                CoCreateLogic.storePassData(this);
                if (!_this.container) {
                    return;
                }

                _this.openWindow(this);
            });
        }
    },

    _initWndButtons: function () {
        var closeBtns = document.querySelectorAll('.btn-modal-close');
        var minmaxBtn = document.querySelector('.btn-modal-maximize');
        var parkBtn = document.querySelector('.btn-modal-minimize');
        var _this = this;

        if (closeBtns.length > 0) {
            for (var i = 0; i < closeBtns.length; i++) {
                var closeBtn = closeBtns[i];
                closeBtn.addEventListener('click', function (e) {
                    e.preventDefault();

                    _this.sendWindowBtnEvent('close');
                })
            }
        }

        if (minmaxBtn) {
            minmaxBtn.addEventListener('click', function (e) {
                e.preventDefault();
                _this.sendWindowBtnEvent('maximize');
                // let state = this.getAttribute('data-state');

                // if (state == 'min') {
                //   _this.sendWindowBtnEvent('minimize');
                //   this.setAttribute('data-state', 'max');
                // } else {
                //   _this.sendWindowBtnEvent('maximize');
                //   this.setAttribute('data-state', 'min');
                // }
            })
        }

        if (parkBtn) {
            parkBtn.addEventListener('click', function (e) {
                e.preventDefault();
                _this.sendWindowBtnEvent('park');
            })
        }
    },

    sendWindowBtnEvent: function (type) {
        var json = {
            "apiKey": config.apiKey,
            "securityKey": config.securityKey,
            "organization_id": config.organization_Id,
            "data": {
                "parentId": this.parentId,
                "pageId": this.pageId,
                "type": type,
                "author": "jin"
            }
        }

        CoCreateSocket.send('windowBtnEvent', json);
    },

    _initSocket: function () {
        var _this = this;
        CoCreateSocket.listen('openWindow', function (data) {
            if (data.parentId == _this.pageId) {
                _this.container._createModal(data);
            }
            // if (data.parentId == _this.pageId) {
            //   _this.container._createModal(data);
            // }
        }),

            CoCreateSocket.listen('windowBtnEvent', function (data) {
                if (data.parentId == _this.pageId) {

                    var pageId = data.pageId;
                    var type = data.type;

                    var modal = _this.container.getModalById(pageId);

                    if (modal) {
                        switch (type) {
                            case 'close':
                                _this.container._removeModal(modal)
                                break;
                            case 'maximize':
                                // minimizeWindow(w);
                                modal._setMaximize();
                                break;
                            case 'park':
                                modal.togglePark();
                                break;
                            default:
                        }
                    }
                }
            })
    },

    openWindow: function (aTag) {

        var attr = {
            url: aTag.getAttribute('href'),
            x: aTag.getAttribute('data-modal_x'),
            y: aTag.getAttribute('data-modal_y'),
            width: aTag.getAttribute('data-modal_width'),
            height: aTag.getAttribute('data-modal_height'),
            ajax: aTag.getAttribute('data-modal_ajax'),
            color: aTag.getAttribute('data-modal_color'),
            header: aTag.getAttribute('data-modal_header') ? aTag.getAttribute('data-modal_header') : "true",

        }

        var open_type = aTag.getAttribute('data-open_in');
        open_type = open_type ? open_type : 'root';

        CoCreateStorage.rootPageId = this.rootId;

        var open_id = open_type;
        // if (this.isRoot) {
        //   CoCreateStorage.parentPageId = this.pageId;
        // } else {
        switch (open_type) {
            case 'parent':
                open_id = this.parentId;
                break;
            case 'page':
                open_id = this.pageId;
                break;
            case 'root':
                open_id = this.rootId;
                break;
            default:
                open_id = open_type;
                break;
            // code
        }
        CoCreateStorage.parentPageId = open_id;

        attr.parentId = open_id;
        // }

        if (this.isRoot) {
            if (this._createContainer()) {
                this.container._createModal(attr);
            }
        } else {
            // attr.parentId = this.parentId;
            CoCreateSocket.send('openWindow', {
                "apiKey": config.apiKey,
                "securityKey": config.securityKey,
                "organization_id": config.organization_Id,
                data: attr
            })
        }
    },
}

CoCreateWindow.generateUUID = function (length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    var d = new Date().toTimeString();
    var random = d.replace(/[\W_]+/g, "").substr(0, 6);
    result += random;
    return result;
}

var CoCreateStorage = {};

Object.defineProperty(CoCreateStorage, "rootPageId", {
    get: function () { return localStorage.getItem('page_rootId'); },
    set: function (id) { localStorage.setItem('page_rootId', id); }
})

Object.defineProperty(CoCreateStorage, "parentPageId", {
    get: function () { return localStorage.getItem('page_parentId'); },
    set: function (id) { localStorage.setItem('page_parentId', id); }
})

Object.defineProperty(CoCreateStorage, "pageId", {
    get: function () { return localStorage.getItem('page_id'); },
    set: function (id) { localStorage.setItem('page_id', id); }
})



var g_cocreateWindow = new CoCreateWindow();

function setparallax() {
    var parallaxEls = document.getElementsByClassName("parallax");

    for (var i = 0; i < parallaxEls.length; i++) {
        var parallaxEl = parallaxEls.item(i);

        parallaxEl.style.backgroundImage = 'url(' + parallaxEl.getAttribute('data-parallax_src') + ')';
        parallaxEl.style.height = parallaxEl.getAttribute('data-parallax_height');
    }

}

setparallax();

var CoCreateProgress = {

    selector: ".progress-wrapper",

    mainObjects: [],

    init: function () {
        this.initElement()
        this.initEvent()
    },

    initElement: function (container) {
        const main_container = container ? container : document;

        let elements = main_container.querySelectorAll(this.selector);
        let _this = this;
        elements.forEach((el) => {
            let filter = CoCreateFilter.setFilter(el, 'data-progress_id', 'progress')

            if (!filter) return;

            let obj = {
                el: el,
                filter: filter,
                id: el.getAttribute('data-progress_id')
            }
            _this.mainObjects.push(obj);
            _this.fetchProgess(el)

        })
    },

    initEvent: function () {
        let _this = this;
        CoCreateSocket.listen('readDocumentList', function (data) {

            if (data.metadata == "progress-total") {
                _this.renderProgress(data, true);
            } else if (data.metadata == "progress-value") {
                _this.renderProgress(data, false)
            }
        })
    },

    renderProgress(data, isTotal) {
        //.
        if (!data) return;
        const element_id = data.element;
        if (!element_id) {
            return;
        }

        const result_count = data['data'].length
        let _this = this;
        let elements = [];
        let selector = isTotal ? '.progressTotal' : '.progressValue';
        selector = selector + `[data-progress_id="${element_id}"]`;

        elements = document.querySelectorAll(selector)

        elements.forEach((el) => {
            el.textContent = result_count;
        })

        //. set progressbar

        elements = document.querySelectorAll(`.progressbar[data-progress_id="${element_id}"]`)

        elements.forEach((el) => {

            if (el.tagName === "PROGRESS") {
                if (isTotal) {
                    el.setAttribute('max', result_count);
                } else {
                    el.setAttribute('value', result_count);
                }
            } else {
                if (isTotal) {
                    el.setAttribute('data-total', result_count);
                } else {
                    el.setAttribute('data-value', result_count);
                }
                _this.renderBar(el)
            }
        })
    },

    renderBar: function (el) {
        const total = Number(el.getAttribute('data-total'));
        const value = Number(el.getAttribute('data-value'));

        if (!total || !value || total === 0) {
            return;
        }

        const percent = (value / total) * 100;
        el.innerHTML = `<div style="width: ${percent}%"></div>`;
    },

    fetchProgess: function (el) {
        let select_obj = null
        let _id = el.getAttribute('data-progress_id')

        this.mainObjects.forEach((item) => {
            if (item.id == _id) {
                select_obj = item;
            }
        })
        if (!select_obj) return;

        let filter = select_obj.filter;
        console.log(filter)
        let totalFilter = CoCreateFilter.makeFetchOptions(filter);
        let valueFilter = CoCreateFilter.makeFetchOptions(filter)

        let progressName = el.getAttribute('data-progress_name')
        let progressValue = el.getAttribute('data-progress_value')

        let valueOperator = el.getAttribute('data-progress_operator') || "contain"

        totalFilter['metadata'] = 'progress-total';
        valueFilter['metadata'] = 'progress-value'

        let val_filter = [].concat(valueFilter['operator']['filters']);
        val_filter.push({ name: progressName, value: [progressValue], operator: valueOperator });
        valueFilter['operator']['filters'] = val_filter;

        CoCreate.readDocumentList(totalFilter)
        CoCreate.readDocumentList(valueFilter)
    }
}

CoCreateProgress.init();




let defaultSaturation = 75;
let defaultLightness = 58;
let defaultAlpha = 1;


function updateRandomColor() {
    let avatars = document.querySelectorAll("[data-background_color='random']");
    for (let el of avatars) {
        el.style.backgroundColor = randomHSLColor();
    }
}

function randomHSLColor() {
    var hash = Math.floor(Math.random() * (360));
    return 'hsla(' + hash + ', ' + defaultSaturation + '%, ' + defaultLightness + '%, ' + defaultAlpha + ')';
}


const CoCreateSocialShare = {

    //document_URL:'https://server.cocreate.app',

    init: function (selector) {
        console.log(this.document_URL)
        selector = selector || 'a.share'
        let elements = document.querySelectorAll(selector);
        elements.forEach(el => this.initElement(el))
    },

    initElement: function (el) {
        var that = this;
        el.addEventListener("click", function (event) {
            event.preventDefault();
            let container = el.closest('.social_share');

            let url = container.dataset['url'] || ''
            if (url == '')
                url = el.dataset['url'] || ''
            var document_URL = encodeURIComponent((url == '') ? document.URL : url);

            let text = container.dataset['text'] || ''
            if (text == '')
                text = el.dataset['text'] || ''
            var text_URL = encodeURIComponent(text)

            let title = container.dataset['title'] || ''
            if (title == '')
                title = el.dataset['title'] || ''
            var title_URL = encodeURIComponent((title == '') ? document.title : title);

            let height = container.dataset['height'] || ''
            if (height == '')
                height = el.dataset['height'] || ''
            height = parseInt((height == '') ? 600 : height);

            let width = container.dataset['width'] || ''
            if (width == '')
                width = el.dataset['width'] || ''
            width = parseInt((width == '') ? 500 : width);

            let media = container.dataset['media'] || ''
            if (media == '')
                media = el.dataset['media'] || ''
            media = encodeURIComponent((media == '') ? '' : media);

            let source = encodeURIComponent(document.URL);

            var network = {};
            switch (el.dataset['network']) {
                case 'facebook':
                    network['url'] = 'https://www.facebook.com/sharer/sharer.php?display=popup&u=' + document_URL + '&title=' + title_URL
                    break;
                case 'twitter':
                    network['url'] = 'https://twitter.com/intent/tweet?text=' + text_URL + '&url=' + document_URL
                    break;
                case 'google':
                    network['url'] = 'https://plus.google.com/share?url=' + document_URL
                    break;
                case 'linkedin':
                    network['url'] = 'https://www.linkedin.com/shareArticle?mini=true&url=' + document_URL + '&title=' + title_URL + '&source=' + source;
                    break;
                case 'pintrest':
                    network['url'] = 'https://www.pinterest.com/pin/create/button/?description=' + title_URL + '&url=' + document_URL + '&media=' + media + '&is_video=false'
                    break;
            }
            network['height'] = height;
            network['width'] = width;
            that.popup(network)
        });
    },

    popup: function (network) {
        var options = 'menubar=no,toolbar=no,resizable=yes,scrollbars=yes,';
        window.open(network["url"], '', options + 'height=' + network["height"] + ',width=' + network["width"]);
    }

}

CoCreateSocialShare.init();


var splitterHorizontalArray = document.getElementsByClassName("svSplitter svHorizontal");
var splitterVerticalArray = document.getElementsByClassName("svSplitter svVertical");

for (let i = 0; i < splitterHorizontalArray.length; i++) {
    splitterHorizontalArray[i].addEventListener('mousedown', initDragHorizontal, false);
    splitterHorizontalArray[i].addEventListener('touchstart', initDragHorizontal, false);
}
for (let i = 0; i < splitterVerticalArray.length; i++) {
    splitterVerticalArray[i].addEventListener('mousedown', initDragVertical, false);
    splitterVerticalArray[i].addEventListener('touchstart', initDragVertical, false);
}

var thisSplitter, myFamily, myPosition, myAboveDiv, myBelowDiv,
    myLeftDiv, myRightDiv, startMouseX, startTouchX, startMouseY,
    startTouchY, startHeightAbove, startHeightBelow, startWidthLeft,
    startWidthRight, startWindowWidth, beforeScreenResizeWidthLeft,
    beforeScreenResizeWidthRight, totalWidth, totalHeight, totalDiv,
    svColumnDivArr, svColumnDivWidthArray,
    svPanelDivArr, svPanelDivHeightArr,
    containerDiv, containerDivWidth, containerDivHeight,
    minMoveLimit, maxMoveLimit,
    mySplitterFamily, mySplitterPosition, restSplitterBelowHeight, restSplitterAboveHeight, restSplitterRightWidth, restSplitterleftWidth;

//////////////////////////////// Horizontal Resizing ////////////////////////
function initDragHorizontal(e) {

    thisSplitter = e.target;
    totalHeight = parseInt(document.defaultView.getComputedStyle(e.path[1]).height, 10);
    /*myFamily: Above, Splitter, Below Divs*/
    myFamily = [];
    for (let i = 0; i < e.path[1].children.length; i++) {
        myFamily.push(e.path[1].children[i]);
    }
    svPanelDivArr = [];
    myFamily.forEach(family => {
        if (family.classList.contains("svPanel"))
            svPanelDivArr.push(family);
    });

    svPanelDivHeightArr = [];
    svPanelDivArr.forEach(panel => {
        svPanelDivHeightArr.push(parseInt(document.defaultView.getComputedStyle(panel).height, 10));
    });
    /*Dont allow other divs move together*/
    for (let i = 0; i < svPanelDivArr.length; i++) {
        svPanelDivArr[i].style.minHeight = svPanelDivHeightArr[i] * 100 / totalHeight + '%';
        svPanelDivArr[i].style.pointerEvents = "none";
    }

    e.path.forEach(element => {
        if (element.classList && element.classList.contains("container"))
            containerDiv = element;
    });
    containerDivHeight = parseInt(document.defaultView.getComputedStyle(containerDiv).height, 10);
    myPosition = myFamily.indexOf(thisSplitter);
    myAboveDiv = myFamily[myPosition - 1];
    myBelowDiv = myFamily[myPosition + 1];

    /*My Splitter Group*/
    mySplitterFamily = [];
    myFamily.forEach(family => {
        if (family.classList.contains("svSplitter") && family.classList.contains("svHorizontal"))
            mySplitterFamily.push(family);
    });
    mySplitterPosition = mySplitterFamily.indexOf(thisSplitter);
    // restSplitterBelowHeight = parseInt(document.defaultView.getComputedStyle(thisSplitter).height,10)*(mySplitterFamily.length-mySplitterPosition)+parseInt(document.defaultView.getComputedStyle(thisSplitter).height,10)/2;
    // restSplitterAboveHeight = parseInt(document.defaultView.getComputedStyle(thisSplitter).height,10)*(mySplitterPosition)+parseInt(document.defaultView.getComputedStyle(thisSplitter).height,10)/2;
    /*Splitter own heights*/
    restSplitterBelowHeight = parseInt(document.defaultView.getComputedStyle(thisSplitter).height, 10) * (mySplitterFamily.length - mySplitterPosition - 1);
    restSplitterAboveHeight = parseInt(document.defaultView.getComputedStyle(thisSplitter).height, 10) * (mySplitterPosition);

    if (e.type == "mousedown")
        startMouseY = e.clientY;
    if (e.type == "touchstart")
        startTouchY = e.touches[0].clientY;

    startHeightAbove = parseInt(document.defaultView.getComputedStyle(myAboveDiv).height, 10);
    startHeightBelow = parseInt(document.defaultView.getComputedStyle(myBelowDiv).height, 10);
    minMoveLimit = startMouseY - startHeightAbove;
    maxMoveLimit = startMouseY + startHeightBelow;
    document.documentElement.addEventListener('mousemove', doDragHorizontal, false);
    document.documentElement.addEventListener('mouseup', stopDragHorizontal, false);
    document.documentElement.addEventListener('touchmove', doDragHorizontal, false);
    document.documentElement.addEventListener('touchend', stopDragHorizontal, false);
}

function doDragHorizontal(e) {
    if (e.type == "mousemove" && (e.clientY > minMoveLimit) && (e.clientY < maxMoveLimit) && (e.clientY > restSplitterAboveHeight + 15) && (e.clientY < containerDivHeight + 15 - restSplitterBelowHeight)) {
        myAboveDiv.style.minHeight = (startHeightAbove + e.clientY - startMouseY) * 100 / (totalHeight) + '%';
        myBelowDiv.style.minHeight = (startHeightBelow - e.clientY + startMouseY) * 100 / (totalHeight) + '%';
    }
    if (e.type == "touchmove" && (e.touches[0].clientY > (startTouchY - startHeightAbove)) && (e.touches[0].clientY < (startTouchY + startHeightBelow)) && (e.touches[0].clientY > restSplitterAboveHeight + 15) && (e.touches[0].clientY < containerDivHeight + 15 - restSplitterBelowHeight)) {

        myAboveDiv.style.minHeight = (startHeightAbove + e.touches[0].clientY - startTouchY) * 100 / (totalHeight) + '%';
        myBelowDiv.style.minHeight = (startHeightBelow - e.touches[0].clientY + startTouchY) * 100 / (totalHeight) + '%';
    }
}
function stopDragHorizontal(e) {
    for (let i = 0; i < svPanelDivArr.length; i++) {
        svPanelDivArr[i].style.pointerEvents = "auto";
    }
    document.documentElement.removeEventListener('mousemove', doDragHorizontal, false);
    document.documentElement.removeEventListener('mouseup', stopDragHorizontal, false);
    document.documentElement.removeEventListener('touchmove', doDragHorizontal, false);
    document.documentElement.removeEventListener('touchend', stopDragHorizontal, false);
}



//////////////////////////////// Vertical Resizing //////////////////////////
function initDragVertical(e) {

    thisSplitter = e.target;
    totalDiv = e.path[1];
    totalWidth = parseInt(document.defaultView.getComputedStyle(totalDiv).width, 10);
    myFamily = [];
    for (let i = 0; i < e.path[1].children.length; i++) {
        myFamily.push(e.path[1].children[i]);
    }
    svColumnDivArr = [];
    myFamily.forEach(family => {
        if (family.classList.contains("svColumn")) {
            svColumnDivArr.push(family);
        }
    }
    );

    svColumnDivWidthArray = [];
    svColumnDivArr.forEach(svColumnDiv => {
        svColumnDivWidthArray.push(parseInt(document.defaultView.getComputedStyle(svColumnDiv).width, 10));
    });

    for (let i = 0; i < svColumnDivArr.length; i++) {
        svColumnDivArr[i].style.minWidth = svColumnDivWidthArray[i] * 100 / totalWidth + '%';
        svColumnDivArr[i].style.pointerEvents = "none";
    }

    e.path.forEach(element => {
        if (element.classList && element.classList.contains("svColumn"))
            containerDiv = element;
    });
    containerDivWidth = parseInt(document.defaultView.getComputedStyle(containerDiv).width, 10);
    myPosition = myFamily.indexOf(thisSplitter);
    myLeftDiv = myFamily[myPosition - 1];
    myRightDiv = myFamily[myPosition + 1];

    mySplitterFamily = [];
    myFamily.forEach(family => {
        if (family.classList.contains("svSplitter") && family.classList.contains("svVertical"))
            mySplitterFamily.push(family);
    });
    mySplitterPosition = mySplitterFamily.indexOf(thisSplitter);
    // restSplitterRightWidth = parseInt(document.defaultView.getComputedStyle(thisSplitter).width,10)*(mySplitterFamily.length-mySplitterPosition)+parseInt(document.defaultView.getComputedStyle(thisSplitter).width,10)/2;
    // restSplitterleftWidth = parseInt(document.defaultView.getComputedStyle(thisSplitter).width,10)*(mySplitterPosition)+parseInt(document.defaultView.getComputedStyle(thisSplitter).width,10)/2;

    restSplitterRightWidth = parseInt(document.defaultView.getComputedStyle(thisSplitter).width, 10) * (mySplitterFamily.length - mySplitterPosition - 1);
    restSplitterleftWidth = parseInt(document.defaultView.getComputedStyle(thisSplitter).width, 10) * (mySplitterPosition);

    if (e.type == "mousedown")
        startMouseX = e.clientX;
    if (e.type == "touchstart")
        startTouchX = e.touches[0].clientX;

    startWindowWidth = window.innerWidth;
    startWidthLeft = parseInt(document.defaultView.getComputedStyle(myLeftDiv).width, 10);
    startWidthRight = parseInt(document.defaultView.getComputedStyle(myRightDiv).width, 10);

    minMoveLimit = startMouseX - startWidthLeft;
    maxMoveLimit = startMouseX + startWidthRight;

    document.documentElement.addEventListener('mousemove', doDragVertical, false);
    document.documentElement.addEventListener('mouseup', stopDragVertical, false);
    document.documentElement.addEventListener('touchmove', doDragVertical, false);
    document.documentElement.addEventListener('touchend', stopDragVertical, false);
    window.addEventListener('resize', doDragVertical, false);
}

function doDragVertical(e) {
    if (e.type == "mousemove" && (e.clientX > minMoveLimit) && (e.clientX < maxMoveLimit) && (e.clientX > restSplitterleftWidth + 15) && (e.clientX < containerDivWidth + 15 - restSplitterRightWidth)) {
        myLeftDiv.style.minWidth = (startWidthLeft + e.clientX - startMouseX) * 100 / (totalWidth) + '%';
        myRightDiv.style.minWidth = (startWidthRight - e.clientX + startMouseX) * 100 / (totalWidth) + '%';

        beforeScreenResizeWidthLeft = parseInt(startWidthLeft + e.clientX - startMouseX, 10);
        beforeScreenResizeWidthRight = parseInt(startWidthRight - e.clientX + startMouseX, 10);
    }
    if (e.type == "touchmove" && (e.touches[0].clientX > (startTouchX - startWidthLeft)) && (e.touches[0].clientX < (startTouchX + startWidthRight)) && (e.touches[0].clientX > restSplitterleftWidth + 15) && (e.touches[0].clientX < containerDivWidth + 15 - restSplitterRightWidth)) {
        myLeftDiv.style.minWidth = (startWidthLeft + e.touches[0].clientX - startTouchX) * 100 / (totalWidth) + '%';
        myRightDiv.style.minWidth = (startWidthRight - e.touches[0].clientX + startTouchX) * 100 / (totalWidth) + '%';
        beforeScreenResizeWidthLeft = parseInt(startWidthLeft + e.touches[0].clientX - startTouchX, 10);
        beforeScreenResizeWidthRight = parseInt(startWidthRight - e.touches[0].clientX + startTouchX, 10);
    }
    if (e.type == "resize") {
        if (window.innerWidth < startWindowWidth)
            myLeftDiv.style.width = (beforeScreenResizeWidthLeft - (startWindowWidth - window.innerWidth)) * 100 / totalWidth + '%';
        if (window.innerWidth > startWindowWidth)
            myLeftDiv.style.width = (beforeScreenResizeWidthRight + (window.innerWidth - startWindowWidth)) * 100 / totalWidth + '%';
    }
    // myLeftDiv.classList.remove("svPanel")
    // myRightDiv.classList.remove("svPanel")

}
function stopDragVertical(e) {
    for (let i = 0; i < svColumnDivArr.length; i++) {
        svColumnDivArr[i].style.pointerEvents = "auto";
    }
    document.documentElement.removeEventListener('mousemove', doDragVertical, false);
    document.documentElement.removeEventListener('mouseup', stopDragVertical, false);
    document.documentElement.removeEventListener('touchmove', doDragVertical, false);
    document.documentElement.removeEventListener('touchend', stopDragVertical, false);
}

/* Parsing CSS for Utility Class of CoCreate.app*/
/* created by Webelf000 */
let linklength = document.styleSheets.length;
let link = document.createElement("link");
link.setAttribute("rel", "stylesheet");
link.setAttribute("type", "text/css");
link.setAttribute("href", "#");
document.head.appendChild(link);
var utilityClassList = [];
var myStyle;
link.addEventListener("load", function () {
    myStyle = document.styleSheets[linklength];
    let elements = document.querySelectorAll("[class]");
    for (let element of elements) {
        addParsingClassList(element.classList);
    }
    sortRules();
    const ob_config = { attributes: true, childList: false, subtree: true };
    const callback = function (mutationsList, observer) {
        for (let mutation of mutationsList) {
            if (mutation.type === 'attributes' && mutation.attributeName === "class") {
                addParsingClassList(mutation.target.classList);
            }
        }
        sortRules();
    };
    const observer = new MutationObserver(callback);
    observer.observe(document.body, ob_config);
});


function sortRules() {
    let ruleList = [];
    let length = utilityClassList.length;
    for (let i in utilityClassList) {
        ruleList.push(myStyle.cssRules[length - i - 1]);
        myStyle.deleteRule(length - i - 1);
    }
    let swapped;
    for (let i = 0; i < length; i++) {
        swapped = false;
        for (let j = length - 1; j > i; j--) {
            if (utilityClassList[j - 1] > utilityClassList[j]) {
                let temp = utilityClassList[j];
                utilityClassList[j] = utilityClassList[j - 1];
                utilityClassList[j - 1] = temp;
                temp = ruleList[j];
                ruleList[j] = ruleList[j - 1];
                ruleList[j - 1] = temp;
                swapped = true;
            }
        }
        if (swapped == false) break;
    }
    for (let i = 0; i < length; i++) {
        myStyle.insertRule(ruleList[i].cssText);
    }
}


function addParsingClassList(classList) {
    let re = /.+:.+/;
    for (let classname of classList) {
        try {
            if (re.exec(classname)) {
                if (utilityClassList.indexOf(classname) == -1) {
                    // let re_important = /.*!important.*/;
                    // let important = 0;
                    // if (re_important.exec(classname)) {
                    //     console.log("important");
                    //     important = 1;
                    //    let temp = classname.split("!important");
                    //    classname = "";
                    //    for (let tmp of temp) {
                    //        classname += tmp;
                    //    }
                    // }
                    let re_at = /.+@.+/;
                    if (re_at.exec(classname)) {
                        let parts = classname.split("@");
                        let main_rule = parseClass(classname);
                        const range_names = ["xs", "sm", "md", "lg", "xl"];
                        const ranges = [[0, 567], [576, 768], [769, 992], [993, 1200], [1201, 0]];
                        for (let i = 1; i < parts.length; i++) {
                            let range_num = range_names.indexOf(parts[i]);
                            if (range_num == -1) continue;
                            let range = ranges[range_num];
                            let prefix = "@media screen";
                            if (range[0] != 0) {
                                prefix += " and (min-width:" + range[0] + "px)";
                            }
                            if (range[1] != 0) {
                                prefix += " and (max-width:" + range[1] + "px)";
                            }
                            let rule = prefix + "{" + main_rule + "}";
                            myStyle.insertRule(rule);
                            utilityClassList.push(classname);
                        }
                    } else {
                        let rule = parseClass(classname);
                        myStyle.insertRule(rule);
                        utilityClassList.push(classname);
                    }
                }
            }
        }
        catch (e) { }
    }
}

function parseClass(classname) {
    let res = classname.split(":");
    let rule = "";
    let suffix = res[1].replace(/\./g, "\\.").replace(/%/, "\\%").replace(/@/g, "\\@").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/#/g, "\\#").replace(/,/g, "\\,").replace(/!/, "\\!");
    res[1] = res[1].split("@")[0];
    res[1] = res[1].replace(/_/g, " ");
    if (res.length > 2) {
        let pseudo = [];
        for (let i = 0; i < res.length - 2; i++) {
            suffix += "\\:" + res[2 + i];
            pseudo.push(":" + res[2 + i]);
        }
        let clsname = "." + res[0] + "\\:" + suffix;
        rule += clsname + pseudo[0];
        for (let i = 1; i < pseudo.length; i++) {
            rule += ", " + clsname + pseudo[i];
        }
        rule += `{${res[0]}:${res[1]}}`;
    } else {
        rule = `.${res[0]}\\:${suffix}{${res[0]}:${res[1]}}`;
    }
    return rule;
}