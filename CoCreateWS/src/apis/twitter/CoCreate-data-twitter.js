'use strict'
const utils= require('../utils');

const Twitter = require("twit");

const consumer_key =  'hOugAN32rGsFldgxqYyJIJDTH';
const consumer_secret =  'OSoVFrQxSk25OioMQZt77X7JOp95RE3HEVYh8pmnGpCgOa1rW1';
const access_token =  '1314075796005253120-cSjwbxAOskNJWWBNla1hZwDzJu1oNU';
const access_token_secret = 'iBzFp3hqGIdEzZNaYtsZTXoXWNyoOHvihT2ns43mTJpIk';
// const bearer_token = 'AAAAAAAAAAAAAAAAAAAAAMTWIQEAAAAATRpXMf%2Bugq2MynRAd9McR2JIap8%3DnfJMaMpiCenN6OlmJstmCaWI7NCiO0oSrwePRaLDZUBXNM2lrj';

const client = new Twitter({ consumer_key, consumer_secret, access_token,  access_token_secret  });
        
class CoCreateDataTwitter {
	constructor(wsManager) {
		this.wsManager = wsManager;
		this.module_id = "twitter";
		this.init();
	}
	
	init() {
		if (this.wsManager) {
			this.wsManager.on(this.module_id, (socket, data) => this.twitterOprations(socket, data));
		}
	}
	
	async twitterOprations(socket, data) {
        const type = data['type'];
        const params = data['data'];
        
        switch (type) {
            case 'getFollowersList':
                this.getFollowersList(socket, type, params);  
                break;
            case 'getUsersShow':
                this.getUsersShow(socket, type, params);  
                break;
            case 'getSearchUser':
                this.getSearchUser(socket, type, params);  
            case 'getFriendsList':
                this.getFriendsList(socket, type, params);  
                break;
            case 'getSearchTweets':
                this.getSearchTweets(socket, type, params);  
                break;
        }
	}
	
	
	
	async getFollowersList(socket, type, params) {
	    const { screen_name } = params;
	    
        const { data : results  } = await client.get("followers/list", { // cursor: 1,
                          screen_name,
                          skip_status  : true,
                          include_user_entities: "flase"
                        })
        const response = {
                    'object': 'list',
                    'data' : results.users,
        };
                
        utils.send_response(this.wsManager,socket,{"type":type,"response":response}, this.module_id)
	}
	
	async getUsersShow(socket, type, params) {
	    const { screen_name, user_id } = params;
	    
        const { data : results  } = await client.get("users/show", { screen_name, user_id });
        const response = {
            'object': 'list',
            'data' : results,
        };
                
        utils.send_response(this.wsManager,socket,{"type":type,"response":response}, this.module_id);
	}
	
	async getSearchUser(socket, type, params) {
	    const { query:q } = params;
	    
        const { data : results  } = await client.get("users/search", { q });
        const response = {
            'object': 'list',
            'data' : results,
        };
                
        utils.send_response(this.wsManager,socket,{"type":type,"response":response}, this.module_id);
	}
	
	async getFriendsList(socket, type, params) {
	    const { screen_name } = params;
	    
        const { data : results  } = await client.get("friends/list", { screen_name });
        const response = {
            'object': 'list',
            'data' : results.users,
        };
                
        utils.send_response(this.wsManager,socket,{"type":type,"response":response}, this.module_id);
	}
	

        
	async getSearchTweets(socket, type, params) {
	   	 const { query:q } = params;
	    
        const { data : results  } = await client.get("search/tweets", { q });
        const response = {
            'object': 'list',
            'data' : results.statuses,
        };
        
        utils.send_response(this.wsManager,socket,{"type":type,"response":response}, this.module_id);

	}
}//end Class 
module.exports = CoCreateDataTwitter;
