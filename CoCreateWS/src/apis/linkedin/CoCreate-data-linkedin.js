'use strict'
var utils= require('../utils');
var http = require('https');
var querystring = require('querystring');

const CLIENT_ID = '78z1r4lb62qb9w';
const CLIENT_SECRET = 'OwrpALJkZLFcwK3m';
const accessToken = 'AQXTghYAKfgGe6Kh94Z5y43kB0w5OkH8GPJKQNc1TqyatLIg-1tLlu5neTAui1uFa2240IYqaX9pwFebKISb7P1KLhYIMHmAiFV1SW3x0hX2MuQy3rcWiYPfKiLZyUGK1Cgpm_ibtRz9tXJPB6Z9A782HfjHxVazJJvAdQ-f7evYAEAbNB3jlgJP4hTzs3-4Lh7I4zwwl6zWU-Y4Om_y0xK5K7gtO_xmg37wUyu9EAdZNRwnZIsgk64E4SbQLJSjjZioabsr7dO_56T_gnmHCBt7BbslHCugiQbQQt5FWh3E-QQGqaWJGWinvN-BmYHt_p9lxoUs5z-AlRd5RjUVVvQYCgasZQ';


const LinkedInAPI = require('node-linkedin-v2');
const linkedInAPI = new LinkedInAPI(CLIENT_ID, CLIENT_SECRET, 'http://52.203.210.252/CoCreate-linkedin/demo/CoCreate-linkedin-form.html');
// const linkedInAPI = new LinkedInAPI(CLIENT_ID, CLIENT_SECRET, 'https://localhost');


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
        
		
        switch (type) {
            case 'linkedinGetProfile':
                    utils.send_response(this.wsManager,socket,{"type":type,"response":[send_data]}, this.module_id)    
            break;
        }
	}
	
}//end Class 
module.exports = CoCreateDataLinkedin;
