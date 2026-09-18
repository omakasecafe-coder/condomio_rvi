export type AssessmentQuestion = { question: string; options: readonly string[] };

export const attitudeQuestions: readonly AssessmentQuestion[] = [
  { question: "Un edificio quiere conocer el servicio, pero aún no decide. ¿Qué haces?", options: ["Insisto en que firme hoy", "Escucho sus necesidades y acuerdo un siguiente paso", "Dejo de contactarlo"] },
  { question: "Un cliente pide una función que no sabes si existe. ¿Cómo respondes?", options: ["Prometo que sí existe", "Le digo que no se puede sin consultar", "Verifico la información antes de comprometerme"] },
  { question: "Tienes varias oportunidades abiertas. ¿Cómo priorizas?", options: ["Doy seguimiento y registro los próximos pasos", "Espero a que los clientes vuelvan a llamar", "Solo atiendo la que parece más grande"] },
  { question: "Administración detecta un dato incorrecto en tu propuesta. ¿Qué haces?", options: ["Lo oculto para no demorar", "Corrijo el dato y aviso oportunamente", "Culpo al cliente"] },
];

export const commercialQuestions: readonly AssessmentQuestion[] = [
  { question: "¿Qué representa un lead en este portal?", options: ["Un edificio potencial cliente", "Una comisión pagada", "Una cuenta bancaria"] },
  { question: "¿Quién puede marcar una oportunidad como Ganado?", options: ["Cualquier vendedor", "El administrador, tras validar el contrato firmado", "Se marca automáticamente después de una demo"] },
  { question: "¿Cómo se calcula la comisión mostrada?", options: ["Precio unitario × número de departamentos", "Un monto fijo por edificio", "Precio unitario ÷ número de departamentos"] },
  { question: "¿Qué ocurre después de registrar una oportunidad?", options: ["Pasa directamente a Ganado", "Comienza en Contacto y se gestiona por etapas", "Se paga de inmediato"] },
];
