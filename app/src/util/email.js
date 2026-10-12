/*
 * Interface para envio de e-mails
 * 
 * Autor: Natanael L. Freire
 * Data: 05/03/2015
 */

const cfg = require("src/util/config"),
    nodemailer = require("nodemailer"),
    smtpTransport = require('nodemailer-smtp-transport'),
    log = require('src/util/logInterno');

;(function () {
    "use strict";
    
    let instance = null;
    
    function Email() {
        const self = this;
        
        /**
         * Qual o nome da real biblioteca que fará o envio do e-mail
         * @type String
         */
        let lib = "nodemailer"; // nodemailer | ses_api
        
        
        let title;
        let from = cfg.email.validacao; // remetente cfg.email.validacao
        let to; // destinatarios separados por virgula
        let replyTo = cfg.email.replyTo; // responder para
        let assunto;
        let corpo_texto;
        let corpo_html;
        let anexo;
        /**
         * Cópia oculta
         * Normalmente usada para enviar e-mails para a adm 99Clinic
         */
        let bcc;
        
        /*------------------------ METEDOS PUBLICOS -------------------------*/

        self.setTitle = function(title){
            self.title = title;
            return self;
        };
        
        self.setTo = function(to){
            self.to = to;
            return self;
        };
        
        self.setFrom = function(from){
            self.from = from;
            return self;
        };
        
        self.setAssunto = function(assunto){
            self.assunto = assunto;
            return self;
        };
        
        self.setTexto = function(txt){
            self.corpo_texto = txt;
            return self;
        };
        
        self.setHtml = function(html){
            self.corpo_html = html;
            return self;
        };
        
        self.setReplyTo = function(email){
            self.replyTo = email;
            return self;
        };

        self.setBCC = function(email){
            self.bcc = email;
            return self;
        };
        
        self.enviar = function(){
            if(lib === "nodemailer"){ 
                enviaPorNodemailer();
            }
            else if(lib === "ses_api") {
                enviaSES();
            }  
        };
        
        /*------------------------ METEDOS PRIVADOS -------------------------*/
        
        /**
         * Envia por SMTP através da biblioteca nodemailer
         * @returns {undefined}
         */
        function enviaPorNodemailer () {           
            const smtpConfig = smtpTransport({
                host: cfg.email.send.host,
                port: cfg.email.send.porta,
                ignoreTLS: cfg.email.send.ignoreTLS,
                secure : cfg.email.send.secure, // se deve usar SSL
                debug: true,
                tls: {
                    rejectUnauthorized: true
                },
                auth: {
                    user: cfg.email.send.login,
                    pass: cfg.email.send.senha
                }
            });
            
            const transporter = nodemailer.createTransport(smtpConfig);
            /////
            let message  = {
                from: self.from,
                to: self.to,
                subject: self.assunto,
                text: self.corpo_texto,
                html: self.corpo_html,
                headers: {
                    'X-Laziness-level': 1000
                },
                replyTo: cfg.email.replyTo
            };
            if(self.corpo_text) message.text = self.corpo_text;
            if(self.corpo_html) message.html = self.corpo_html;
            if(self.bcc) message.bcc = self.bcc;
            
            transporter.sendMail(message, function(error, info) {
                if(error){
                    // Para registrar no log no mysql

                    let erroLog = `Erro ao enviar e-mail
                    Destinatário: ${self.to}
                    Asunto: ${self.assunto}
                    responseCode: ${error.responseCode || ''}
                    response: ${error.response || ''}
                    `;

                    log.registraErro( erroLog, 'email', 'Arquivo: src/util/email.js');
                    return;
                }
            });
        }
        
        
        /**
         * Envia o e-mailo através da API aws ses que esta hospedado no mesmo 
         * servidor da API do koiber no endereço http://api.koiber.com/email-service
         * @returns {undefined}
         */
        function enviaSES() {            
            const qs = require("querystring"),
                http = require("http");

            const options = {
              "method": "POST",
              "hostname": "api.koiber.com",
              "port": null,
              "path": "/email-service",
              "headers": {
                "cache-control": "no-cache",
                "content-type": "application/x-www-form-urlencoded"
              }
            };

            let req = http.request(options, function (res) {
                res.setEncoding('utf8');
                let chunks = [];

                res.on("data", function (chunk) {
                  chunks.push(chunk);
                });

                res.on("end", function () {
                  let body = Buffer.concat(chunks);
                });
            });
            
            let mensagem = self.corpo_html || self.corpo_texto;
            req.write(qs.stringify({ destinatario: self.to,
              assunto: self.assunto,
              mensagem: mensagem,
              secret: process.env.EMAIL_SES_TOKEN || null,
              token: process.env.EMAIL_SES_SECRET || null })
            );
            req.end();
        }// enviaSES
    }
    
    module.exports = Email;
    
    if(instance === null){
        instance = new Email();
    }
    
    Email.Email = instance; // retorna a uma nova instancia pronta para uso, ex: let email = require("./email.js").Email
    
}());