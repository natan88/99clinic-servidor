/*
 * Configuração geral do sistema
 */

require('dotenv').config();

// IMPORTANTE: a grande maioria das configurações setadas aqui devem ser definidas via VARIAVEIS DE AMBIENTE
;(function () {
    "use strict";

    module.exports = {
       porta_web: process.env.SITE_PORT || 3000,
       porta_ws: 3099,
       url_site: process.env.SITE_URL || "http://app.99clinic.local",       
       
       mysql: {
           port: process.env.MYSQL_PORT || 3306,
           host: process.env.MYSQL_HOST || '127.0.0.1',
           user: process.env.MYSQL_USER || 'root',
           password: process.env.MYSQL_PASS || 'admin',
           database: process.env.MYSQL_DB || 'clinic99'
       },

       redis: {
            port: process.env.REDIS_PORT || 6379,
            host: process.env.REDIS_HOST || '127.0.0.1',
            password: process.env.REDIS_PASSWORD || null
        },

       /*
        * Lista dos e-mails 
        * 
        */
       email: {
           validacao: process.env.SMTP_EMAIL || "99Clinic <contato@99clinic.com>",
           replyTo: process.env.SMTP_REPLAY_TO || "contato@99clinic.com", // e-mail de resposta, interno
           send:{
                service: process.env.SMTP_SERVICE || "SMTP",
                host:  process.env.SMTP_HOST || "smtp.99clinic.com", 
                porta: process.env.SMTP_PORT || 587,
                comAutenticacao: (process.env.SMTP_AUTH ? process.env.SMTP_AUTH.toString().toLowerCase() : "true") === "true", //requiresAuth | true
                secure: (process.env.SMTP_SSL ? process.env.SMTP_SSL.toString().toLowerCase() : "false") === "true", //se é para usar SSL ou não | false
                ignoreTLS: (process.env.SMTP_IGNORE_TLS ? process.env.SMTP_IGNORE_TLS.toString().toLowerCase() : "true") === "true",
                login: process.env.SMTP_LOGIN || '',
                senha:  process.env.SMTP_PASSWORD || ''
           }
       },

       // GOOGLE CLOUD PLATFORM
       gcp: {
            projectId: process.env.GCP_PROJECT_ID || null,
            clientEmail: process.env.GCP_CLIENT_EMAIL || null,
            privateKey: process.env.GCP_PRIVATE_KEY || null,
            storage: {
                bucketName: process.env.GCP_BUCKET_NAME || '99clinic-dev'
            }
       },

       // GOOGLE agenda
       googleAgenda: {
            clientID: process.env.GCALENDAR_CLIENT_ID || null,
            clientSecret: process.env.GCALENDAR_CLIENT_SECRET || null,
            redirectUrl: process.env.GCALENDAR_REDIRECT_URL || null // https://app.99clinic.com/config/integracoes
       },

       // autenticação do serviço https://www.cloudimage.io
       authImgCdn: process.env.AUTH_IMG_CDN || null,
       imgCdnUrl: process.env.CLOUDIMG_URL || null // url base do serviço de CDN de imagem

    };
}());