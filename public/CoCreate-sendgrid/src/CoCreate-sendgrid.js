
const CoCreateSendGrid = {
	id: 'sendgrid',
	actions: [
		'sendgridDomainList',
	],
	
	pre_sendgridDomainList: function(data) {
		console.log(JSON.stringify(data));
	},
}


CoCreateApi.register(CoCreateSendGrid.id, CoCreateSendGrid);