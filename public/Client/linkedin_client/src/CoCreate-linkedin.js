
const CoCreateLinkedin = {
	id: 'linkedin',
	actions: [
		'linkedinGetProfile',
		'actionLinkedin'
	],
	
	pre_linkedinGetProfile: function(data) {
		console.log(data)

	}
}


CoCreateApi.register(CoCreateLinkedin.id, CoCreateLinkedin);

