function loadScript(url, callback)
{
    // Adding the script tag to the head as suggested before
    var head = document.getElementsByTagName('head')[0];
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = url;

    // Then bind the event to the callback function.
    // There are several events for cross browser compatibility.
    script.onreadystatechange = callback;
    script.onload = callback;

    // Fire the loading
    head.appendChild(script);
}
loadScript("../../../src/config.js");
loadScript("../../../src/CoCreate.js");
loadScript("../../../src/CoCreate-api.js");
loadScript("../../../src/CoCreate-data-stripe.js");
