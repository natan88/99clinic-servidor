;(function () {
    "use strict";
    

    const Promise = require("promise"),
        mysql = require('src/util/conexoes.js'),
        _ = require('underscore');
    
    let instance = null;
    const maxDownloadPerPage = 1000;
    
   
    function ExportarFinanceiro() {
        const self = this;
        
        /*------------------------------ FINANCEIRO --------------------------*/
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
                    if(_.contains(where.convenio, null)) { // somente particular
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
                    if(where.consulta === 'c') {
                        _where += ' AND a.atendimento_id IS NULL'; 
                    }
                    if(where.consulta === 'r') {
                        _where += ' AND a.atendimento_id IS NOT NULL'; 
                    }
                }
                
                if(_.has(where, 'id') && _.isNumber(where.id)) {
                    let id = parseInt(where.id) || 0;
                    if(id > 0) {
                        _where = ' AND a.id = ?';
                        find = [empresaID, where.id];
                    }
                }
            }
            return {where: _where, find: find};
        }//getWhere

        self.exportar = function(empresaID, where, pagina) {
            return new Promise( function ( resolve ) {
                let t = getWhere(empresaID, where);
                let max = maxDownloadPerPage;
                pagina = parseInt(pagina) || 1;
                pagina = (pagina - 1) * max;
                t.find.push(pagina);
                t.find.push(max);

                let select = `SELECT a.id AS atendimento_id, a.procedimento AS servico, p.nome AS profissional, c.nome AS paciente, 
                    IFNULL(cv.nome, "particular") AS convenio,
                    a.dt_agenda AS agendado_para, a.dt_status AS data_status, 

                    CASE 
                        WHEN a.atendimento_id IS NULL THEN "consulta"
                        ELSE "retorno"
                    END AS consulta,
                    
                    a.status,
                    CASE 
                        WHEN a.status = '1' THEN "agendado"
                        WHEN a.status = '2' THEN "confirmado"
                        WHEN a.status = '3' THEN "na recepção"
                        WHEN a.status = '4' THEN "em atendimento"
                        WHEN a.status = '5' THEN "atendido"
                        WHEN a.status = '6' THEN "cancelado"
                        WHEN a.status = '7' THEN "faltou"
                        WHEN a.status = '8' THEN "encaminhado"
                        ELSE "indefinido"
                    END AS status_nome,

                    CASE 
                        WHEN a.pg_valor >= (a.valor + IFNULL(a.acrescimo, 0) - IFNULL(a.desconto, 0)) THEN "pago"
                        WHEN a.pg_valor > 0 AND a.pg_valor < ( a.valor + IFNULL(a.acrescimo, 0) - IFNULL(a.desconto, 0) ) THEN "pago parcial"
                        WHEN IFNULL(a.pg_valor, 0) = 0 AND ( a.valor + IFNULL(a.acrescimo, 0) - IFNULL(a.desconto, 0) ) > 0 THEN "falta pagar"
                        WHEN IFNULL(a.pg_valor, 0) = 0 AND ( a.valor + IFNULL(a.acrescimo, 0) - IFNULL(a.desconto, 0) ) = 0 AND (a.atendimento_id IS NULL) THEN "grátis"
                        WHEN a.atendimento_id IS NOT NULL THEN "n/a"
                        ELSE "indefinido"
                    END AS status_pagamento,

                    a.valor, IFNULL(a.desconto, 0) AS desconto, IFNULL(a.acrescimo, 0) AS acrescimo, IFNULL(a.comissao, 0) AS repasse,  
                    IFNULL(a.pg_valor, 0) AS valor_pago, COALESCE(a.pg_dt, '') AS data_pagamento, COALESCE(a.pg_dt_cheque, '') AS data_cheque, 
                    COALESCE(a.pg_forma, '') AS forma_pagamento, COALESCE(a.pg_parcelas, '') AS parcelas

                    FROM v_atendimento a 
                    LEFT JOIN cliente c ON (c.id = a.cliente_id)
                    LEFT JOIN convenio cv ON (cv.id = a.convenio_id)
                    LEFT JOIN profissional p ON (p.id = a.profissional_id)
                    WHERE a.empresa_id = ? ${t.where} 
                    LIMIT ?,?`;
                
                mysql.query(select, t.find, function(err, result){
                    if(err || !result) return resolve([]);
                    if(result.length === 0) return resolve([]);
                    resolve(result);
                });
            });
        };//financeiro
        
        
    }
    
    if(instance === null) instance = new ExportarFinanceiro();
    module.exports = ExportarFinanceiro;
    ExportarFinanceiro.Exportar = instance;
}());