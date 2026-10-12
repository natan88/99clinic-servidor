
/*
 *  Controlador das exportações de dados (profissionais, pacientes, atendimentos,
 *  etc)
 */

;(function () {
    "use strict";

    let express = require('express'),
            router = express.Router(),
            js2xmlparser = require("js2xmlparser"),
            // json2csv = require('json2csv'),
            { Parser } = require('json2csv'),
            Cliente = require("src/controller/cliente/cliente.js").Cliente,
            Atendimento = require("src/controller/exportar/exportar-atendimento.js").Exportar,
            Profissional = require("src/controller/exportar/exportar-profissional.js").Exportar,
            Servico = require("src/controller/exportar/exportar-servico.js").Exportar,
            Convenio = require("src/controller/exportar/exportar-convenio.js").Exportar,
            Financeiro = require("src/controller/exportar/exportar-financeiro.js").Exportar,
            Logado = require("../autenticacao.js").logado,
            eAdmin = require("../autenticacao.js").soAdmin,
            soAdminOuProfissional = require("../autenticacao.js").soAdminOuProfissional,
            eAssinante = require("../autenticacao.js").assinante,
            moment = require('moment');

    /**
     * para ser usado com o js2xmlparser
     * Formata a data no padrão ISO
     * No futuro pode ser incluido outros formatadores/transformadores de dados
     */
    const typeHandlers = {
        "[object Date]": (value) => {
            return moment(value).format('YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
        }
    };
            
    //----------------------------- PACIENTES ---------------------------
    router.post('/paciente/json', Logado, eAdmin, eAssinante, function (req, res) {
        let pagina = req.query.pagina || 1;
        Cliente.exporta(req.user.empresa_id, pagina).then(function (_data) {
            let data = moment().format("YYYY-MM-DD");
            res.attachment('pacientes-'+data+'-'+pagina+'.json');
            res.send(_data);
        });
    });

    const cliColunas = ["id", "nome", "nascimento", "sexo", "cpf", "rg", "rg_orgao", "estado_civil", "uf", "cidade", "bairro", "endereco", "complemento", "cep", "nota", "nota_contato", "telefone", "celular", "email"];
    router.post('/paciente/csv', Logado, eAdmin, eAssinante, function (req, res) {
        let pagina = req.query.pagina || 1;
        Cliente.exporta(req.user.empresa_id, pagina).then(function (_data) {
            try {
                const parser = new Parser({ cliColunas, doubleQuotes: '', delimiter: ';' });           
                const data = moment().format("YYYY-MM-DD");

                res.attachment('pacientes-'+data+'-'+pagina+'.csv');
                res.send( parser.parse( _data ) );

            } catch (error) {
                res.send(200, "Erro ao processar solicitação");
            }
        });
    });
    
    const optionClienteXml = {cdataKeys: ["nome", "rg_orgao", "estado_civil", "cidade", "bairro", "endereco", "complemento", "nota", "nota_contato", "email"], prettyPrinting: {enabled:false}, typeHandlers};
    router.post('/paciente/xml', Logado, eAdmin, eAssinante, function (req, res) {
        let pagina = req.query.pagina || 1;
        Cliente.exporta(req.user.empresa_id, pagina).then(function (_data) {
            let data = moment().format("YYYY-MM-DD");
            let xml = js2xmlparser.parse("pacientes", {paciente: _data}, optionClienteXml);
            res.attachment('pacientes-'+data+'-'+pagina+'.xml');
            res.send(xml);
        });
    });
    
    //----------------------------- FINANCEIRO ---------------------------   
    router.post('/financeiro/json', Logado, eAdmin, eAssinante, function (req, res) {
        let where = JSON.parse(req.body.where);
        let pagina = req.query.pagina || 1;
        Financeiro.exportar(req.user.empresa_id, where, pagina).then(function (_data) {
            let data = moment().format("YYYY-MM-DD");
            res.attachment('financeiro-'+data+'-'+pagina+'.json');
            res.send(_data);
        });
    });

    let finColunas = ['atendimento_id', 'servico', 'profissional', 'paciente', 'convenio', 'agendado_para', 'data_status', 'consulta', 'status', 'status_nome', 'status_pagamento', 'valor', 'desconto', 'acrescimo', 'repasse', 'valor_pago', 'data_pagamento', 'data_cheque', 'forma_pagamento', 'parcelas'];
    router.post('/financeiro/csv', Logado, eAdmin, eAssinante, function (req, res) {
        let where = JSON.parse(req.body.where);
        let pagina = req.query.pagina || 1;

        Financeiro.exportar(req.user.empresa_id, where, pagina).then(function (_data) {
            try {
                const parser = new Parser({ finColunas, doubleQuotes: '', delimiter: ';' });           
                const data = moment().format("YYYY-MM-DD");

                res.attachment('financeiro-'+data+'-'+pagina+'.csv');
                res.send( parser.parse( _data ) );

            } catch (error) {
                res.send("Erro ao processar solicitação");
            }
        });
    });
    
    let optionFinanXml = {cdataKeys: ["servico", "profissional", "paciente", "convenio", 'consulta', "status_nome", "status_pagamento", 'forma_pagamento'], prettyPrinting: {enabled:false}, declaration: {encoding: 'UTF-8'}, typeHandlers};
    router.post('/financeiro/xml', Logado, eAdmin, eAssinante, function (req, res) {
        let pagina = req.query.pagina || 1;
        let where = JSON.parse(req.body.where);
        Financeiro.exportar(req.user.empresa_id, where, pagina).then(function (_data) {
            let data = moment().format("YYYY-MM-DD");
            let head = {
                '@': {
                    "source":"99clinic.com",
                    "date": data
                },
                registro: _data
            };
            head = {registro: _data};
            let xml = js2xmlparser.parse("financeiro", head, optionFinanXml);
            res.attachment('financeiro-'+data+'-'+pagina+'.xml');
            res.send(xml);
        });
    });
    //----------------------------- fim FINANCEIRO ---------------------------
    
    
    //----------------------------- ATENDIMENTOS ---------------------------
    router.post('/atendimento/json', Logado, soAdminOuProfissional, eAssinante, function (req, res) {
        let where = JSON.parse(req.body.where);
        let pagina = req.query.pagina || 1;
        Atendimento.exportar(req.user.empresa_id, where || {}, req.user, pagina).then(function (_data) {
            let data = moment().format("YYYY-MM-DD");
            res.attachment('atendimento-'+data+'-'+pagina+'.json');
            res.send(_data);
        });
    });

    let atmColunas = ['id', 'cliente_id', 'servico_id', 'profissional_id', 'convenio_id', 'servico', 'profissional', 'paciente', 'convenio', 'data_cadastro', 'agendado_para', 'data_status', 'status', 'status_nome', 'valor', 'desconto', 'acrescimo', 'repasse', 'valor_pago', 'data_pagamento', 'data_cheque', 'forma_pagamento', 'parcelas', 'obs_pagamento', 'observacao', 'convenio_codigo'];
    router.post('/atendimento/csv', Logado, soAdminOuProfissional, eAssinante, function (req, res) {
        let where = JSON.parse(req.body.where);
        let pagina = req.query.pagina || 1;

        Atendimento.exportar(req.user.empresa_id, where || {}, req.user, pagina).then(function (_data) {
            try {
                const parser = new Parser({ atmColunas, doubleQuotes: '', delimiter: ';' });
                const csv = parser.parse( _data );              
                const data = moment().format("YYYY-MM-DD");

                res.attachment('atendimento-'+data+'-'+pagina+'.csv');
                res.send(csv);

            } catch (error) {
                res.status(200).send("Erro ao processar solicitação");
            }
        });
    });
    
    let optionAtmXml = {cdataKeys: ['servico', 'profissional', 'paciente', 'convenio', 'status_nome', 'forma_pagamento', 'obs_pagamento', 'observacao'], prettyPrinting: {enabled:false}, typeHandlers };
    router.post('/atendimento/xml', Logado, soAdminOuProfissional, eAssinante, function (req, res) {        
        let pagina = req.query.pagina || 1;
        let where = JSON.parse(req.body.where);
        Atendimento.exportar(req.user.empresa_id, where || {}, req.user, pagina).then(function (_data) {
            let data = moment().format("YYYY-MM-DD");
            let head = {atendimento: _data};
            let xml = js2xmlparser.parse("atendimentos", head, optionAtmXml);
            res.attachment('atendimento-'+data+'-'+pagina+'.xml');
            res.send(xml);
        });
    });
    //--------------------------- fim ATENDIMENTOS ---------------------------
    
    //--------------------------- PROFISSIONAL ---------------------------
    router.post('/profissional/json', Logado, eAdmin, eAssinante, function (req, res) {
        Profissional.exportar(req.user.empresa_id).then(function (_data) {
            let data = moment().format("YYYY-MM-DD");
            res.attachment('profissional-'+data+'.json');
            res.send(_data);
        });
    });

    let profColunas = ['id','dt_cadastro','nome','sexo','nascimento','nota','uf','cidade','bairro','endereco','cep','email','celular','telefone','cpf','conselho','conselho_uf','conselho_nr','tratamento','especialidade','horario','ativo','servico','convenio'];
    router.post('/profissional/csv', Logado, eAdmin, eAssinante, function (req, res) {
        Profissional.exportar(req.user.empresa_id).then(function (_data) {
            try {
                const parser = new Parser({ profColunas, doubleQuotes: '', delimiter: ';' });           
                const data = moment().format("YYYY-MM-DD");

                res.attachment('profissional-'+data+'.csv');
                res.send( parser.parse( _data ) );

            } catch (error) {
                res.send("Erro ao processar solicitação");
            }
        });
    });
    
    const optionPrXml = {cdataKeys: ['nome','nota','cidade','bairro','endereco','email','conselho','conselho_uf','conselho_nr','tratamento','especialidade'], prettyPrinting: {enabled:false}, typeHandlers};
    router.post('/profissional/xml', Logado, eAdmin, eAssinante, function (req, res) {
        Profissional.exportar(req.user.empresa_id).then(function (_data) {
            let data = moment().format("YYYY-MM-DD");
            const xml = js2xmlparser.parse("profissionais", {profissional: _data}, optionPrXml);
            res.attachment('profissional-'+data+'.xml');
            res.send(xml);
        });
    });
    /*--------------------------- fim PROFISSIONAL ---------------------------*/
    
    
    /*--------------------------- SERVIÇOS ---------------------------*/
    router.post('/servico/json', Logado, eAdmin, eAssinante, function (req, res) {
        Servico.exportar(req.user.empresa_id).then(function (_data) {
            let data = moment().format("YYYY-MM-DD");
            res.attachment('servico-'+data+'.json');
            res.send(_data);
        });
    });


    let srvColunas = ['id','nome','descricao','valor','tempo','prazo_retorno','ativo'];
    router.post('/servico/csv', Logado, eAdmin, eAssinante, function (req, res) {
        Servico.exportar(req.user.empresa_id).then(function (_data) {
            try {
                const parser = new Parser({ srvColunas, doubleQuotes: '', delimiter: ';' });           
                const data = moment().format("YYYY-MM-DD");

                res.attachment('servico-'+data+'.csv');
                res.send( parser.parse( _data ) );

            } catch (error) {
                res.send("Erro ao processar solicitação");
            }
        });
    });
    
    let optionSrvXml = {cdataKeys: ["nome", "descricao"], prettyPrinting: {enabled:false}, typeHandlers};
    router.post('/servico/xml', Logado, eAdmin, eAssinante, function (req, res) {        
        Servico.exportar(req.user.empresa_id).then(function (_data) {
            let data = moment().format("YYYY-MM-DD");
            let xml = js2xmlparser.parse("servicos", {servico: _data}, optionSrvXml);
            res.attachment('servico-'+data+'.xml');
            res.send(xml);
        });
    });
    /*--------------------------- fim SERVIÇOS ---------------------------*/
    
    
    /*--------------------------- CONVÊNIOS ---------------------------*/
    router.post('/convenio/json', Logado, eAdmin, eAssinante, function (req, res) {
        Convenio.exportar(req.user.empresa_id).then(function (_data) {
            let data = moment().format("YYYY-MM-DD");
            res.attachment('convenio-'+data+'.json');
            res.send(_data);
        });
    });

    let conColunas = ['id', 'nome', 'ativo'];
    router.post('/convenio/csv', Logado, eAdmin, eAssinante, function (req, res) {
        Convenio.exportar(req.user.empresa_id).then(function (_data) {
            try {
                const parser = new Parser({ conColunas, doubleQuotes: '', delimiter: ';' });           
                const data = moment().format("YYYY-MM-DD");

                res.attachment('convenio-'+data+'.csv');
                res.send( parser.parse( _data ) );

            } catch (error) {
                res.send("Erro ao processar solicitação");
            }
        });
    });
    
    let optionConXml = {cdataKeys: ["nome"], prettyPrinting: {enabled:false}, typeHandlers};
    router.post('/convenio/xml', Logado, eAdmin, eAssinante, function (req, res) {        
        Convenio.exportar(req.user.empresa_id).then(function (_data) {
            let data = moment().format("YYYY-MM-DD");
            let xml = js2xmlparser.parse("convenios", {convenio: _data}, optionConXml);
            res.attachment('convenio-'+data+'.xml');
            res.send(xml);
        });
    });
    /*--------------------------- fim CONVÊNIOS ---------------------------*/

    module.exports = router;
}());