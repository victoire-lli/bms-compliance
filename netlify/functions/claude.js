const https = require("https");

exports.handler = function(event, context, callback) {
  if (event.httpMethod !== "POST") {
    return callback(null, { statusCode: 405, body: "Method Not Allowed" });
  }

  const body = event.body;
  const options = {
    hostname: "api.anthropic.com",
    path: "/v1/messages",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    }
  };

  const req = https.request(options, function(res) {
    var data = "";
    res.on("data", function(chunk) { data += chunk; });
    res.on("end", function() {
      callback(null, {
        statusCode: res.statusCode,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: data
      });
    });
  });

  req.on("error", function(e) {
    callback(null, {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: { message: e.message } })
    });
  });

  req.write(body);
  req.end();
};
