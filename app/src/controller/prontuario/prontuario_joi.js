
;(function () {
    "use strict";

    const Joi = require("joi");

    // usar esse recurso https://github.com/hapijs/joi/issues/364 para gerar menos código com menor possibilidade de erro
    // uma vez feito isso, os schemas serão menores e herdarão propriedades básicas

          
    const input = Joi.object().keys({
        tipo: Joi.string().lowercase().regex(/^(text|textarea|number|money|email|phone|date|checkbox|radio|select|pa|po)$/).required(),
        id: Joi.number().integer().positive().min(1),
        nome: Joi.string().max(150).allow('', null).empty(''),
        ordem: Joi.number().integer().positive().min(1).required(),
        response: Joi.string().allow('', null).empty('')
    });

    const inputNumberSchema = input.keys({
        conf: Joi.object().keys({
            unidade: Joi.string().max(20).allow(['', null]),
            casas: Joi.number().min(0).max(20).multiple(1).allow(['', null]),
        })
    });

    const inputMoneySchema = input.keys({
        response: Joi.number().allow('', null)
    });

    const schemaModelos = Joi.array().items(
        Joi.object().keys({
            nome: Joi.string().max(50).required(),
            conteudo: Joi.string().min(10).max(17000).required()
        })
    ).unique((a, b)=> {return a.nome === b.nome;});
    
    const inputTextareaSchema = input.keys({
        modelo: schemaModelos
    });
    
    const paSchema = input.keys({
        response: Joi.object().keys({
            sistolica: Joi.number().integer().positive().multiple(1).min(1).allow(null),
            diastolica: Joi.number().integer().positive().multiple(1).min(1).allow(null),
            frequencia: Joi.number().integer().positive().multiple(1).min(1).allow(null),
            status: Joi.string().lowercase().regex(/^(normal|baixa|alta)$/, 'Não permitido').allow('', null)
        })
    });

    const poSchema = input.keys({
        response: Joi.object().keys({
            nota: Joi.string().allow('', null),
            perto: Joi.object().keys({
                od: Joi.object().keys({
                    esferico: Joi.string(),
                    cilindro: Joi.string(),
                    eixo: Joi.string(),
                    dnp: Joi.string(),
                }),
                oe: Joi.object().keys({
                    esferico: Joi.string(),
                    cilindro: Joi.string(),
                    eixo: Joi.string(),
                    dnp: Joi.string(),
                })
            }),
            longe: Joi.object().keys({
                od: Joi.object().keys({
                    esferico: Joi.string(),
                    cilindro: Joi.string(),
                    eixo: Joi.string(),
                    dnp: Joi.string(),
                }),
                oe: Joi.object().keys({
                    esferico: Joi.string(),
                    cilindro: Joi.string(),
                    eixo: Joi.string(),
                    dnp: Joi.string(),
                })
            })
        })
    });

    const checkboxSchema = input.keys({
        conf: Joi.object().keys({
            orientation: Joi.string().lowercase().regex(/^(horizontal|vertical)$/),
            options: Joi.array().items(
                Joi.object().keys({
                    value: Joi.string().max(100).required(),
                    checked: Joi.boolean()
                })
            ).required().min(1).unique((a, b)=> {return a.value === b.value;})// com essa forma de comparar, o value deve ser único
        })
    });
    
    const selectSchema = input.keys({
        conf: Joi.object().keys({
            options: Joi.array().items(
                Joi.object().keys({
                    value: Joi.string().max(100).required(),
                    selected: Joi.boolean()
                })
            ).required().min(1).unique((a, b)=> {return a.value === b.value;})// com essa forma de comparar, tanto o value quanto o label devem ser únicos
        })
    });
    
//    ---------------------------- FIM DOS ELEMENTOS DO FORMULÁRIO ---------------

    // com os campos dessa forma, a saída de erro é correta, da forma que estava não era possível saber qual o tipo de erro que deu em determinado objeto
    const campos = Joi.object()
        .when(Joi.object({tipo: 'text'}).unknown(),     {then: input})
        .when(Joi.object({tipo: 'textarea'}).unknown(), {then: inputTextareaSchema})
        .when(Joi.object({tipo: 'number'}).unknown(),   {then: inputNumberSchema})
        .when(Joi.object({tipo: 'money'}).unknown(),    {then: inputMoneySchema})
        .when(Joi.object({tipo: 'email'}).unknown(),    {then: input})
        .when(Joi.object({tipo: 'phone'}).unknown(),    {then: input})
        .when(Joi.object({tipo: 'date'}).unknown(),     {then: input})
        .when(Joi.object({tipo: 'checkbox'}).unknown(), {then: checkboxSchema})
        .when(Joi.object({tipo: 'radio'}).unknown(),    {then: checkboxSchema})
        .when(Joi.object({tipo: 'select'}).unknown(),   {then: selectSchema})
        .when(Joi.object({tipo: 'pa'}).unknown(),       {then: paSchema})
        .when(Joi.object({tipo: 'po'}).unknown(),       {then: poSchema})
    

    const t = Joi.object().options({ abortEarly: false }).keys({
        id: Joi.number().positive().min(1),
        nome: Joi.string().min(3).max(50).required(),
        ordem: Joi.number().integer().positive().min(1),
        ativo: Joi.string().regex(/^(s|n)$/).allow('', null).strip(),
        campos: Joi.array().items(
            campos
        ).required().min(1).unique((a, b)=> {return a.id === b.id && a.id && b.id;})
    });


    exports.prontuario_schema = t;
    exports.modelos_schema = schemaModelos;
}());