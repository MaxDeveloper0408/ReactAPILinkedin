
const CoCreateDataStripe = require('./apis/data-stripe/CoCreate-data-stripe')
const CoCreateDataLinkedin = require('./apis/data-stripe/CoCreate-data-linkedin')
module.exports.WSManager = function(manager) {
	new CoCreateDataStripe(manager)
	new CoCreateDataLinkedin(manager)
}
