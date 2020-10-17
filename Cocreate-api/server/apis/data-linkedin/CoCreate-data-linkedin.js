'use strict'
var utils= require('../utils');
var http = require('https');
var querystring = require('querystring');

const CLIENT_ID = '78z1r4lb62qb9w';
const CLIENT_SECRET = 'OwrpALJkZLFcwK3m';
const accessToken = 'AQWwNxdMO6dMYXN5BaH9g8BMeDZ94zhFuKjuNBS-L7v94HUjaIrDUk-RA8Vo9YSn20IpvLC8oWoz9ixB0rlqbR3a4uXqaNadloF8sfLekkIn7xudWFrP2SfcixItLsI24DIm5cXc9XrKrB2lFHYKzm7Tw2lTWmVYA4OWn2-DXD4sjoR1avghPrpw28njCz87JXn1juk1zKH_W-dqq0SA9vi7A_8yaEc-_Z4ELkl2Mc1YX7fkifGvSZg5z6h_U7jh7LDGkzcDKT1sB2UGIcdAvRmJQt98wW6gxX0c6M5Z4fI4MZXRo2KhuNuaZcMU9yXkm12gX6XINWWn_5Fy5ACrn14MdQBhcQ';


const LinkedInAPI = require('node-linkedin-v2');
// const linkedInAPI = new LinkedInAPI(CLIENT_ID, CLIENT_SECRET, 'http://52.203.210.252/CoCreate-linkedin/demo/CoCreate-linkedin-form.html');
const linkedInAPI = new LinkedInAPI(CLIENT_ID, CLIENT_SECRET, 'https://localhost');


class CoCreateDataLinkedin {
	constructor(wsManager) {
		this.wsManager = wsManager;
		this.module_id = "linkedin";
		this.init();
	}
	
	init() {
		if (this.wsManager) {
			this.wsManager.on(this.module_id, (socket, data) => this.sendLinkedin(socket, data));
		}
	}

	async sendLinkedin(socket, data) {	    
	    
        let type = data['type'];
        let send_data = await linkedInAPI.getCurrentMemberProfile(['id', 'firstName', 'lastName','email'], accessToken)
		send_data = {data: [send_data]}
		console.log(send_data)
        switch (type) {
            case 'linkedinGetProfile':
                    utils.send_response(this.wsManager,socket,{"type":type,"response":send_data}, this.module_id)    
            break;
        }
	}
	
}//end Class 
module.exports = CoCreateDataLinkedin;
