/*
 * Smoke test do banco MySQL para validar estrutura e saúde do schema.
 * Usa a mesma configuração do app, valida versão, sql_mode, views,
 * procedures/functions e consultas críticas do projeto.
 */

;(function () {
    "use strict";

    const mysql = require('mysql');
    const config = require('./src/util/config.js');

    const pool = mysql.createPool({
        host: config.mysql.host,
        port: config.mysql.port,
        user: config.mysql.user,
        password: config.mysql.password,
        database: config.mysql.database,
        charset: 'utf8mb4',
        multipleStatements: false,
        connectionLimit: 5,
        timezone: 'Z',
        debug: false
    });

    const VIEW_CANDIDATES = [
        'v_adm_empresa',
        'v_atendimento',
        'v_assinatura',
        'v_fatura'
    ];

    function query(sql, params) {
        return new Promise((resolve, reject) => {
            pool.getConnection((err, connection) => {
                if (err) return reject(err);

                connection.query(sql, params || [], (error, results) => {
                    connection.release();
                    if (error) return reject(error);
                    resolve(results);
                });
            });
        });
    }

    function formatResult(label, value) {
        return `${label}: ${value}`;
    }

    function printHeader(title) {
        console.log('\n' + '='.repeat(80));
        console.log(title);
        console.log('='.repeat(80));
    }

    function buildList(items) {
        if (!items || !items.length) return 'nenhum';
        return items.map((item) => item.name || item.TABLE_NAME || item.ROUTINE_NAME || item).join(', ');
    }

    function normalizeCallResult(result) {
        if (Array.isArray(result) && result.length && Array.isArray(result[0])) {
            return result[0];
        }
        return result;
    }

    async function getRealRoutineValues() {
        const empresa = await query("SELECT id FROM empresa WHERE ativo = 's' ORDER BY id LIMIT 1");
        if (!empresa || !empresa.length) {
            throw new Error('Nenhuma empresa ativa encontrada para testar procedures/functions reais.');
        }

        let profissional = await query(
            'SELECT id, empresa_id FROM profissional WHERE empresa_id = ? AND ativo = ? ORDER BY id LIMIT 1',
            [empresa[0].id, 's']
        );
        if (!profissional || !profissional.length) {
            profissional = await query('SELECT id, empresa_id FROM profissional WHERE ativo = ? ORDER BY id LIMIT 1', ['s']);
        }

        let servico = await query(
            'SELECT id, empresa_id, tempo FROM servico WHERE empresa_id = ? AND ativo = ? ORDER BY id LIMIT 1',
            [empresa[0].id, 's']
        );
        if (!servico || !servico.length) {
            servico = await query('SELECT id, empresa_id, tempo FROM servico WHERE ativo = ? ORDER BY id LIMIT 1', ['s']);
        }

        let atendimento = await query(
            'SELECT id, empresa_id, profissional_id FROM atendimento WHERE empresa_id = ? AND profissional_id = ? ORDER BY id LIMIT 1',
            [empresa[0].id, profissional[0] ? profissional[0].id : 0]
        );
        if (!atendimento || !atendimento.length) {
            atendimento = await query('SELECT id, empresa_id, profissional_id FROM atendimento ORDER BY id LIMIT 1');
        }

        let assinatura = await query(
            'SELECT id, empresa_id FROM assinatura WHERE empresa_id = ? ORDER BY id LIMIT 1',
            [empresa[0].id]
        );
        if (!assinatura || !assinatura.length) {
            assinatura = await query('SELECT id, empresa_id FROM assinatura ORDER BY id LIMIT 1');
        }

        let horario = await query(
            'SELECT dia FROM profissional_horario WHERE profissional_id = ? ORDER BY id LIMIT 1',
            [profissional[0] ? profissional[0].id : 0]
        );
        if (!horario || !horario.length) {
            horario = await query('SELECT dia FROM profissional_horario ORDER BY id LIMIT 1');
        }

        const dataInicial = await query('SELECT DATE_ADD(CURDATE(), INTERVAL 1 DAY) AS data_inicial, DATE_ADD(CURDATE(), INTERVAL 14 DAY) AS data_final');

        return {
            empresaId: empresa[0].id,
            profissionalId: profissional[0] ? profissional[0].id : null,
            servicoId: servico[0] ? servico[0].id : null,
            atendimentoId: atendimento[0] ? atendimento[0].id : null,
            assinaturaId: assinatura[0] ? assinatura[0].id : null,
            dia: horario[0] ? horario[0].dia : 'mon',
            intervalo: servico[0] && servico[0].tempo ? Number(servico[0].tempo) : 30,
            dataInicial: dataInicial[0].data_inicial,
            dataFinal: dataInicial[0].data_final,
            dataTeste: dataInicial[0].data_inicial
        };
    }

    async function main() {
        const summary = {
            ok: [],
            warn: [],
            fail: []
        };

        try {
            printHeader('1) Conexão e versão');
            const versionRows = await query('SELECT VERSION() AS version, DATABASE() AS database_name');
            const version = versionRows[0].version;
            const databaseName = versionRows[0].database_name;

            console.log(formatResult('MySQL', version));
            console.log(formatResult('Database', databaseName));
            console.log(formatResult('Host', config.mysql.host));
            summary.ok.push('Conexão MySQL ativa');

            const sqlModeRows = await query("SHOW VARIABLES LIKE 'sql_mode'");
            const sqlMode = sqlModeRows.find((row) => row.Variable_name === 'sql_mode');
            console.log(formatResult('sql_mode', sqlMode ? sqlMode.Value : 'não informado'));

            const lowerCaseRows = await query("SHOW VARIABLES LIKE 'lower_case_table_names'");
            const lowerCase = lowerCaseRows.find((row) => row.Variable_name === 'lower_case_table_names');
            console.log(formatResult('lower_case_table_names', lowerCase ? lowerCase.Value : 'não informado'));

            if (version.toLowerCase().includes('5.7')) {
                summary.warn.push('A versão do MySQL é 5.7; este teste foi feito para validar o 8.x.');
            }
        } catch (error) {
            console.error('Erro ao conectar no banco:', error.message);
            summary.fail.push(`Falha na conexão: ${error.message}`);
        }

        try {
            printHeader('2) Estrutura do schema');
            const tables = await query(`
                SELECT TABLE_NAME AS name
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE()
                ORDER BY TABLE_NAME
            `);

            const views = await query(`
                SELECT TABLE_NAME AS name
                FROM information_schema.VIEWS
                WHERE TABLE_SCHEMA = DATABASE()
                ORDER BY TABLE_NAME
            `);

            const routines = await query(`
                SELECT ROUTINE_NAME AS name, ROUTINE_TYPE AS type
                FROM information_schema.ROUTINES
                WHERE ROUTINE_SCHEMA = DATABASE()
                ORDER BY ROUTINE_TYPE, ROUTINE_NAME
            `);

            console.log(formatResult('Total de tabelas', tables.length));
            console.log(formatResult('Total de views', views.length));
            console.log(formatResult('Total de routines', routines.length));
            console.log(formatResult('Views', buildList(views)));
            console.log(formatResult('Routines', buildList(routines)));

            if (!views.length) {
                summary.warn.push('Nenhuma view encontrada no schema atual.');
            }

            if (!routines.length) {
                summary.warn.push('Nenhuma routine (procedure/function) encontrada no schema atual.');
            }

            summary.ok.push('Leitura da estrutura do schema concluída');
        } catch (error) {
            console.error('Erro ao consultar schema:', error.message);
            summary.fail.push(`Falha ao consultar schema: ${error.message}`);
        }

        try {
            printHeader('3) Validação de funções e procedures com dados reais');
            const valores = await getRealRoutineValues();

            console.log('Dados reais usados:', JSON.stringify(valores, null, 2));

            const checks = [
                {
                    name: 'f_atendimentos_disponiveis',
                    type: 'function',
                    sql: 'SELECT f_atendimentos_disponiveis(?, ?, ?) AS resultado',
                    params: [valores.empresaId, valores.profissionalId, valores.intervalo],
                    okIf: (rows) => rows && rows.length > 0
                },
                {
                    name: 'f_data_checkin_srv',
                    type: 'function',
                    sql: 'SELECT f_data_checkin_srv(?) AS resultado',
                    params: [valores.servicoId],
                    okIf: (rows) => rows && rows.length > 0
                },
                {
                    name: 'f_retornos_atendimento',
                    type: 'function',
                    sql: 'SELECT f_retornos_atendimento(?) AS resultado',
                    params: [valores.atendimentoId],
                    okIf: (rows) => rows && rows.length > 0
                },
                {
                    name: 'p_assinatura_profissionais',
                    type: 'procedure',
                    sql: 'CALL p_assinatura_profissionais(?, ?, ?)',
                    params: [valores.assinaturaId, valores.dataInicial, valores.dataFinal],
                    okIf: (rows) => Array.isArray(rows)
                },
                {
                    name: 'p_horario_livre_medico',
                    type: 'procedure',
                    sql: 'CALL p_horario_livre_medico(?, ?, ?, ?, ?)',
                    params: [valores.empresaId, valores.profissionalId, valores.dataInicial, valores.intervalo, valores.dia],
                    okIf: (rows) => Array.isArray(rows)
                },
                {
                    name: 'p_horario_livre_srv',
                    type: 'procedure',
                    sql: 'CALL p_horario_livre_srv(?, ?, ?, ?)',
                    params: [valores.empresaId, valores.servicoId, valores.profissionalId, valores.dataTeste],
                    okIf: (rows) => Array.isArray(rows)
                },
                {
                    name: 'p_remove_dados_demonstracao',
                    type: 'procedure',
                    sql: 'CALL p_remove_dados_demonstracao()',
                    params: [],
                    okIf: (rows) => Array.isArray(rows)
                }
            ];

            for (const item of checks) {
                try {
                    const result = await query(item.sql, item.params);
                    const normalized = normalizeCallResult(result);
                    console.log(`OK -> ${item.name} :: ${JSON.stringify(normalized).slice(0, 200)}`);
                    summary.ok.push(`${item.type === 'function' ? 'Function OK' : 'Procedure OK'}: ${item.name}`);
                } catch (error) {
                    console.log(`FAIL -> ${item.name} :: ${error.message}`);
                    summary.fail.push(`${item.type === 'function' ? 'Function falhou' : 'Procedure falhou'}: ${item.name} :: ${error.message}`);
                }
            }
        } catch (error) {
            console.error('Erro ao validar routines com dados reais:', error.message);
            summary.fail.push(`Falha ao validar routines com dados reais: ${error.message}`);
        }

        try {
            printHeader('4) Validação de views críticas');
            for (const viewName of VIEW_CANDIDATES) {
                try {
                    const rs = await query(`SELECT * FROM \`${viewName}\` LIMIT 1`);
                    console.log(`OK -> ${viewName} (${rs.length} linha(s) retornada(s))`);
                    summary.ok.push(`View OK: ${viewName}`);
                } catch (error) {
                    console.log(`FAIL -> ${viewName} :: ${error.message}`);
                    summary.fail.push(`View falhou: ${viewName} :: ${error.message}`);
                }
            }
        } catch (error) {
            console.error('Erro ao validar views:', error.message);
            summary.fail.push(`Falha ao validar views: ${error.message}`);
        }

        try {
            printHeader('5) Validação de procedures e functions no schema');
            const routines = await query(`
                SELECT ROUTINE_NAME AS name, ROUTINE_TYPE AS type, ROUTINE_DEFINITION AS definition
                FROM information_schema.ROUTINES
                WHERE ROUTINE_SCHEMA = DATABASE()
                ORDER BY ROUTINE_TYPE, ROUTINE_NAME
            `);

            if (!routines.length) {
                console.log('Nenhuma procedure/function encontrada no schema.');
                summary.warn.push('Nenhuma procedure/function foi encontrada para validar.');
            } else {
                for (const routine of routines) {
                    try {
                        if (routine.type === 'PROCEDURE') {
                            const createSql = await query(`SHOW CREATE PROCEDURE \`${routine.name}\``);
                            console.log(`OK -> PROCEDURE ${routine.name}`);
                            console.log('Definição:', createSql[0]['Create Procedure'].slice(0, 180) + (createSql[0]['Create Procedure'].length > 180 ? '...' : ''));
                            summary.ok.push(`Procedure OK: ${routine.name}`);
                        }

                        if (routine.type === 'FUNCTION') {
                            const createSql = await query(`SHOW CREATE FUNCTION \`${routine.name}\``);
                            console.log(`OK -> FUNCTION ${routine.name}`);
                            console.log('Definição:', createSql[0]['Create Function'].slice(0, 180) + (createSql[0]['Create Function'].length > 180 ? '...' : ''));
                            summary.ok.push(`Function OK: ${routine.name}`);
                        }
                    } catch (error) {
                        console.log(`FAIL -> ${routine.type} ${routine.name} :: ${error.message}`);
                        summary.fail.push(`${routine.type} falhou: ${routine.name} :: ${error.message}`);
                    }
                }
            }
        } catch (error) {
            console.error('Erro ao validar routines:', error.message);
            summary.fail.push(`Falha ao validar routines: ${error.message}`);
        }

        try {
            printHeader('5) Consultas críticas do app');
            const criticalQueries = [
                { name: 'total de tabelas', sql: 'SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()' },
                { name: 'total de views', sql: 'SELECT COUNT(*) AS total FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE()' },
                { name: 'total de routines', sql: 'SELECT COUNT(*) AS total FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE()' },
                { name: 'teste de gravação/leitura de schema', sql: 'SELECT 1 AS ok' }
            ];

            for (const q of criticalQueries) {
                const rows = await query(q.sql);
                console.log(formatResult(q.name, rows[0] && rows[0].total !== undefined ? rows[0].total : rows[0].ok));
                summary.ok.push(`Consulta OK: ${q.name}`);
            }
        } catch (error) {
            console.error('Erro ao executar consultas críticas:', error.message);
            summary.fail.push(`Falha nas consultas críticas: ${error.message}`);
        }

        printHeader('Resumo final');
        console.log('OK:', summary.ok.length);
        console.log('WARN:', summary.warn.length);
        console.log('FAIL:', summary.fail.length);

        if (summary.warn.length) {
            console.log('\nWarnings:');
            summary.warn.forEach((item) => console.log(' - ' + item));
        }

        if (summary.fail.length) {
            console.log('\nFalhas:');
            summary.fail.forEach((item) => console.log(' - ' + item));
            process.exitCode = 1;
        }

        if (!summary.fail.length && summary.ok.length > 0) {
            console.log('\nBanco parece OK para o smoke test executado.');
        }

        pool.end(() => {
            process.exit(process.exitCode || 0);
        });
    }

    main().catch((error) => {
        console.error('Erro fatal no smoke test:', error);
        process.exit(1);
    });
}());
