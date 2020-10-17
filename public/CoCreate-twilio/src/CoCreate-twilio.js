
const CoCreateTwilio = {
	id: 'twilio',
	actions: [
		'twilioListSubAccounts'
	],
	pre_twilioListSubAccounts: function(data) {
		console.log(data);
	}
}


CoCreateApi.register(CoCreateTwilio.id, CoCreateTwilio);