
const CoCreateTwitter = {
	id: 'twitter',
	actions: [
		'getFollowersList',
		'getUsersShow',
		'getSearchUser',
		'getFriendsList',
		'getSearchTweets'
	],
	
	pre_getFollowersList: function(data) {
		console.log(data);
	},

	pre_getUsersShow: function(data) {
		console.log(data);
	},
	
	pre_getSearchUser: function(data) {
		console.log(data);
	},
	
	pre_getFriendsList: function(data) {
		console.log(data);
	},
	
	pre_getSearchTweets: function(data) {
		console.log(data);
	}
};


CoCreateApi.register(CoCreateTwitter.id, CoCreateTwitter);