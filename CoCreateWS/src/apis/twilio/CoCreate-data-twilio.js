'use strict'
var utils= require('../utils');

class CoCreateDataTwilio {
	constructor(wsManager) {
		this.wsManager = wsManager;
		this.module_id = "twilio";
		this.init();
	}
	
	init() {
		if (this.wsManager) {
			this.wsManager.on(this.module_id, (socket, data) => this.sendTwilio(socket, data));
		}
	}
	
	
	twilioInit()
	{
	    const accountId = 'ACa677caf4788f8e1ae9451097da1712d0';
        const authToken = '21861a6b2aa4ab0359a222d30ad19d19';
        return require('twilio')(accountId, authToken);
	}
	
	async sendXXX(socket, data) {
	    let that = this;
        let action = data['type'];
        const twilio = this.twilioInit();
                
        switch (action) {
            case 'CreateSubAccount':
                await this.twilioCreateSubAccount(socket,that,action,data,twilio);break;
        }
        
	}
	
	async sendTwilio(socket, data) {
        let type = data['type'];
        const twilio = this.twilioInit();

        switch (type) {
            case 'twilioListSubAccounts':
               await this.twilioListSubAccounts(socket, type, twilio); break;
            
        }
	}

	async twilioListSubAccounts(socket,type,twilio) {
	     
		 const subAccounts =  await twilio.api.accounts.list();
         const response = {
            object:'list',
            data:subAccounts,
         };
        
        utils.send_response(this.wsManager,socket,{"type":type,"response":response}, this.module_id);
	}
	
	async twilioCreateSubAccounts(socket,that,action,data,twilio) {

         const subAccount = await twilio.api.accounts.create({friendlyName: data.friendlyName})

         utils.send_response(that.wsManager, socket, {"type":action,"response":data.data}, this.module_id);
	}
	
	
}//end Class 
module.exports = CoCreateDataTwilio;
