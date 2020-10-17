
// const CoCreateLinkedin = {
// 	id: 'linkedin',
// 	actions: [
// 		'linkedinGetProfile',
// 		'actionLinkedin'
// 	],
	
// 	pre_linkedinGetProfile: function(data) {
// 		console.log(data)

// 	}
// }


// CoCreateApi.register(CoCreateLinkedin.id, CoCreateLinkedin);


let container = btn.closest("form") || document;
let data = CoCreateApi.getFormData('linkedin', 'getClient',  container);
CoCreateApi.send('linkedin', 'getClient', [data]);