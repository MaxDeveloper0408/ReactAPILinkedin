
const CoCreateFacebook = {
	id: 'facebook',
	actions: [
		'stripeListCustomers',
		'stripeBalanceTranscation',
		'stripeGetBalance'
	],
	
	pre_stripeBalanceTranscation: function(data) {
		console.log(data);
	},
	
	pre_stripeGetBalance: function(data) {
		console.log(data);
	}, 
	
	pre_stripeListCustomers: function(data) {
		console.log(data);
	}
}

CoCreateApi.register(CoCreateStripe.id, CoCreateStripe);