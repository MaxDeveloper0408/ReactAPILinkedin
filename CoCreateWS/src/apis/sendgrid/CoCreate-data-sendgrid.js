'use strict'
var utils= require('../utils');

const sgMail = require('@sendgrid/mail');
const apiKey = 'Bearer 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';
// sgMail.setApiKey(apiKey);

class CoCreateDataSendGrid {
    constructor(wsManager) {
		this.wsManager = wsManager;
		this.module_id = "sendgrid";
		this.init();
	}
	
	init() {
		if (this.wsManager) {
			this.wsManager.on(this.module_id, (socket, data) => this.sendSendGrid(socket, data));
		}
	}
	
	async sendSendGrid(socket, data) {
        let type = data['type'];
        switch (type) {
            case 'sendgridDomainList':
                var http = require("https");
				var options = {
				  "method": "GET",
				  "hostname": "api.sendgrid.com",
				  "port": null,
				  "path": "/v3/whitelabel/domains",
				  "headers": {
				    "authorization": apiKey
				  }
				};
				
				var req = http.request(options, function (res) {
				  var chunks = [];
				  res.on("data", function (chunk) {
				    chunks.push(chunk);
				  });
				  res.on("end", function () {
				    var body = Buffer.concat(chunks);
				    console.log(body.toString());
				    utils.send_response(this.wsManager,socket,{"type":type,"response":body}, this.module_id)
				  });
				});
				req.write("{}");
				req.end();
            break;
        }
	}
}
module.exports = CoCreateDataSendGrid;