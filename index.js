const express = require("express");
const path = require("path");
const hbs = require("express-handlebars");
const dotenv = require("dotenv");
const morgan = require("morgan");
const { uuid } = require("uuidv4");
const { Client, Config, CheckoutAPI } = require("@adyen/api-library");

const app = express();
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "/public")));


dotenv.config({
  path: "./.env",
});


const config = new Config();
config.apiKey = process.env.API_KEY;
const client = new Client({ config });
client.setEnvironment("TEST");
const checkout = new CheckoutAPI(client);


app.engine(
  "handlebars",
  hbs({
    defaultLayout: "main",
    layoutsDir: __dirname + "/views/layouts",
    helpers: require("./util/helpers"),
  })
);


app.set("view engine", "handlebars");


app.post("/api/getPaymentMethods", async (req, res) => {
  try {
    const response = await checkout.paymentMethods({
      channel: "Web",
      merchantAccount: process.env.MERCHANT_ACCOUNT,
    });
    res.json(response);
  } catch (err) {
    console.error(`Error: ${err.message}, error code: ${err.errorCode}`);
    res.status(err.statusCode).json(err.message);
  }
});


app.post("/api/initiatePayment", async (req, res) => {
  const currency = findCurrency(req.body.paymentMethod.type);
  const shopperIP = req.headers["x-forwarded-for"] || req.connection.remoteAddress;


  try {
    const orderRef = uuid();
    const response = await checkout.payments({
      amount: { currency, value: 2700 }, 
      reference: "Rujan_checkoutChallenge", 
      merchantAccount: process.env.MERCHANT_ACCOUNT, 
      channel: "Web", 
      additionalData: {
        allow3DS2: true,
      },
      origin: "http://localhost:8080", // required for 3ds2 native flow
      browserInfo: req.body.browserInfo, // required for 3ds2
      shopperIP, // required by some issuers for 3ds2
      returnUrl: `http://localhost:8080/api/handleShopperRedirect?orderRef=${orderRef}`, // required for 3ds2 redirect flow
      paymentMethod: req.body.paymentMethod.type.includes("boleto")
        ? {
            type: "boletobancario_santander",
          }
        : req.body.paymentMethod,
      socialSecurityNumber: req.body.socialSecurityNumber,
      shopperName: req.body.shopperName,
      billingAddress:
        typeof req.body.billingAddress === "undefined" || Object.keys(req.body.billingAddress).length === 0
          ? null
          : req.body.billingAddress,
      deliveryDate: "2023-12-31T23:00:00.000Z",
      shopperStatement: "Aceitar o pagamento até 15 dias após o vencimento.Não cobrar juros. Não aceitar o pagamento com cheque",
      countryCode: req.body.paymentMethod.type.includes("klarna") ? "DE" : null,
      shopperReference: "12345",
      shopperEmail: "youremail@email.com",
      shopperLocale: "en_US",
      lineItems: [
        {
          quantity: "1",
          amountExcludingTax: "331",
          taxPercentage: "2100",
          description: "Shoes",
          id: "Item 1",
          taxAmount: "69",
          amountIncludingTax: "400",
        },
        {
          quantity: "2",
          amountExcludingTax: "248",
          taxPercentage: "2100",
          description: "Socks",
          id: "Item 2",
          taxAmount: "52",
          amountIncludingTax: "300",
        },
      ],
    });

    res.json(response);
  } catch (err) {
    console.error(`Error: ${err.message}, error code: ${err.errorCode}`);
    res.status(err.statusCode).json(err.message);
  }
});


app.post("/api/submitAdditionalDetails", async (req, res) => {
  const payload = {
    details: req.body.details,
    paymentData: req.body.paymentData,
  };


  try {
    
    const response = await checkout.paymentsDetails(payload);


    res.json(response);
  } catch (err) {
    console.error(`Error: ${err.message}, error code: ${err.errorCode}`);
    res.status(err.statusCode).json(err.message);
  }
});


app.all("/api/handleShopperRedirect", async (req, res) => {
  const redirect = req.method === "GET" ? req.query : req.body;
  const details = {};
  if (redirect.redirectResult) {
    details.redirectResult = redirect.redirectResult;
  } else if (redirect.payload) {
    details.payload = redirect.payload;
  }


  try {
    const response = await checkout.paymentsDetails({ details });
    switch (response.resultCode) {
      case "Authorised":
        res.redirect("/result/success");
        break;
      case "Pending":
      case "Received":
        res.redirect("/result/pending");
        break;
      case "Refused":
        res.redirect("/result/failed");
        break;
      default:
        res.redirect("/result/error");
        break;
    }
  } catch (err) {
    console.error(`Error: ${err.message}, error code: ${err.errorCode}`);
    res.redirect("/result/error");
  }
});



app.get("/", (req, res) => res.render("index"));


app.get("/preview", (req, res) =>
  res.render("preview", {
    type: req.query.type,
  })
);


app.get("/checkout", (req, res) =>
  res.render("checkout", {
    type: req.query.type,
    clientKey: process.env.CLIENT_KEY,
  })
);


app.get("/result/:type", (req, res) =>
  res.render("result", {
    type: req.params.type,
  })
);


function findCurrency(type) {
  switch (type) {
    case "ach":
      return "USD";
    case "wechatpayqr":
    case "alipay":
      return "CNY";
    case "dotpay":
      return "PLN";
    case "boletobancario":
    case "boletobancario_santander":
      return "BRL";
    case "ideal":
      return "EUR";
    default:
      return "EUR";
  }
}



// Start the server :)
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));