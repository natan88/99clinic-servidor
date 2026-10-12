;(function () {
    "use strict";
    

    const Promise = require("promise"),
        mysql = require('src/util/conexoes.js'),
        async = require('async'),
        _ = require('underscore');
    
    let instance = null;
    
    function Financeiro() {
        const self = this;
        
        /*--------------- Para listagem dos atendimentos --------------*/
        function getWhere (empresaID, where) {
            let _where = '';
            let find = [empresaID];
            if(where && _.isObject(where)) {
                if(_.has(where, 'status') && _.isArray(where.status) && !_.isEmpty(where.status)) {
                    _where += ' AND a.status IN ?'; 
                    find.push([where.status]);
                }
                if(_.has(where, 'paciente') && _.isArray(where.paciente) && !_.isEmpty(where.paciente)) {
                    _where += ' AND a.cliente_id IN ?';
                    find.push([where.paciente]);
                }
                if(_.has(where, 'medico') && _.isArray(where.medico) && !_.isEmpty(where.medico)) {
                    _where += ' AND a.profissional_id IN ?';
                    find.push([where.medico]);
                }
                if(_.has(where, 'servico') && _.isArray(where.servico) && !_.isEmpty(where.servico)) {
                    _where += ' AND a.servico_id IN ?';
                    find.push([where.servico]);
                }
                if(_.has(where, 'convenio') && _.isArray(where.convenio) && !_.isEmpty(where.convenio)) {
                    if(_.contains(where.convenio, null)) { // também particular
                        _where += ' AND (a.convenio_id IN ? OR a.convenio_id IS NULL)';
                    }else{ // somente com os convênios informados
                        _where += ' AND a.convenio_id IN ?';
                    }
                    find.push([where.convenio]);
                }
                if(_.has(where, 'data') && _.isObject(where.data)) {
                    if(_.has(where.data, 'inicio') && !_.isEmpty(where.data.inicio) && _.has(where.data, 'fim') && !_.isEmpty(where.data.fim)){
                        _where += ' AND CAST(a.dt_agenda AS date) BETWEEN ? AND ?';
                        find.push([where.data.inicio]);
                        find.push([where.data.fim]);
                    }
                }
                if(_.has(where, 'pagamento') && _.isNumber(where.pagamento)) {
                    let pg = parseInt(where.pagamento);
                    if(pg === 1) { // pago totalmente
                        _where += ' AND (IFNULL(a.pg_valor,0) >= (a.valor - IFNULL(a.desconto, 0) + IFNULL(a.acrescimo, 0)))';
                    }
                    if(pg === 2) { // pago parcialmente
                        _where += ' AND (IFNULL(a.pg_valor,0) > 0 AND IFNULL(a.pg_valor,0) < (a.valor - IFNULL(a.desconto,0) + IFNULL(a.acrescimo,0)))';
                    }
                    if(pg === 3) { // não pago
                        _where += ' AND (IFNULL(a.pg_valor,0) = 0 AND (a.valor - IFNULL(a.desconto,0) + IFNULL(a.acrescimo,0)) > 0)';
                    }
                }
                
                if(_.has(where, 'formapg') && !_.isEmpty(where.formapg)) {
                    _where += ' AND a.pg_forma IN ?'; 
                    find.push([where.formapg]);
                }
                
                if(_.has(where, 'consulta') && !_.isEmpty(where.consulta)) {
                    if(where.consulta == 'c') {
                        _where += ' AND a.atendimento_id IS NULL'; 
                    }
                    if(where.consulta == 'r') {
                        _where += ' AND a.atendimento_id IS NOT NULL'; 
                    }
                }
                
                if(_.has(where, 'id') && _.isNumber(where.id)) {
                    _where = ' AND a.id = ?';
                    find = [empresaID, where.id];
                }
            }

            return {where: _where, find: find};
        }//getWhere
        
        self.totalRegistros = function(empresaID, where) {
            return new Promise( function ( resolve ) {                
                let t = getWhere(empresaID, where);
                
                const Total = function(callback) {
                    mysql.query('SELECT count(*) AS total FROM v_atendimento a WHERE a.empresa_id = ? '+t.where+'', t.find, function(err, result){
                        if(err || !result) return callback(null, 0);
                        if(result.length == 0) return callback(null, 0);
                        callback(null, result[0].total);
                    });
                };
                
                let selectSoma = 'SELECT SUM(a.valor) AS valor, SUM(a.comissao) AS comissao, SUM(IFNULL(a.desconto,0)) AS desconto, SUM(IFNULL(a.acrescimo,0)) AS acrescimo FROM v_atendimento a WHERE a.empresa_id = ? '+t.where+'';
                const Soma = function(callback) {
                    let vazio = {valor: 0, desconto: 0, acrescimo: 0};
                    mysql.query(selectSoma, t.find, function(err, result){
                        if(err || !result) return callback(null, vazio);
                        if(result.length == 0) return callback(null, vazio);
                        callback(null, result[0]);
                    });
                };
                
                async.parallel({total: Total, soma: Soma
                }, function (err, result) {
                    return resolve(result);
                });
            });
        };//totalRegistros
        
        self.getRegistros = function(empresaID, where, pagina, ordem) {
            return new Promise( function ( resolve ) {
                let t = getWhere(empresaID, where);
                let max = 15;
                pagina = parseInt(pagina) || 1;
                pagina = (pagina - 1) * max;
                t.find.push(pagina);
                t.find.push(max);
                
                // ordem de busca
                let orderBy = 'a.dt_cadastro DESC';
                if(ordem && _.isObject(ordem)){
                    let d = 'DESC';
                    if(_.has(ordem, 'ordem') && ordem.ordem == 'asc') d = 'ASC';
                    switch (ordem.item) {
                        case 'servico': orderBy = 'a.procedimento ' +d;break;
                        case 'paciente':orderBy = 'c.nome ' +d;break;
                        case 'medico':  orderBy = 'p.nome ' +d;break;
                        case 'status':  orderBy = 'a.status ' +d;break;
                        case 'valor':   orderBy = 'a.valor ' +d;break;
                        case 'data':    orderBy = 'a.dt_agenda ' +d;break;
                        case 'convenio':orderBy = 'cv.nome ' +d;break;
                        case 'retorno': orderBy  = 'a.atendimento_id ' +d;break;
                        case 'formapg': orderBy  = 'a.pg_forma ' +d;break;
                        case 'parcelas':orderBy  = 'a.pg_parcelas ' +d;break;
                        case 'cheque':  orderBy  = 'a.pg_dt_cheque ' +d;break;
                        case 'datapg':  orderBy  = 'a.pg_dt ' +d;break;
                        case 'desconto':orderBy  = 'a.desconto ' +d;break;
                        case 'acrescimo':orderBy  = 'a.acrescimo ' +d;break;
                        case 'dtstatus':orderBy  = 'a.dt_status ' +d;break;
                        case 'comissao':orderBy  = 'a.comissao ' +d;break;
                        case 'id':      orderBy  = 'a.id ' +d;break;
                    }
                }

                let select = `SELECT a.id AS atID, a.cliente_id, a.servico_id, a.profissional_id, a.valor, a.dt_agenda, a.dt_status, a.procedimento, 
                    a.status, a.atendimento_id AS retorno, 
                    IFNULL(a.desconto, 0) AS desconto, IFNULL(a.acrescimo, 0) AS acrescimo, IFNULL(a.comissao, 0) AS comissao,  IFNULL(a.pg_valor, 0) AS pg_valor, a.pg_dt, a.pg_dt_cheque, a.pg_forma, a.pg_parcelas, 
                    c.nome AS cliente_nome, cv.nome AS convenio_nome, 
                    p.nome AS profissional_nome
                    FROM v_atendimento a 
                    LEFT JOIN cliente c ON (c.id = a.cliente_id)
                    LEFT JOIN convenio cv ON (cv.id = a.convenio_id)
                    LEFT JOIN profissional p ON (p.id = a.profissional_id)
                    WHERE a.empresa_id = ? ${t.where}
                    ORDER BY ${orderBy} LIMIT ?,?`;
                
                mysql.query(select, t.find, function(err, result){
                    if(err || !result) return resolve([]);
                    if(result.length == 0) return resolve([]);
                    resolve(result);
                });
            });
        };//getRegistros

    }
    
    if(instance === null) instance = new Financeiro();
    module.exports = Financeiro;
    Financeiro.Financeiro = instance;
}());