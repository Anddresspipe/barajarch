/**
 * Crea en tu Google Drive el formulario de validación de BarajaArch.
 * Uso: abre https://script.google.com, crea un proyecto nuevo, pega este código,
 * pulsa Ejecutar sobre la función crearFormulario y acepta los permisos.
 * Al terminar, el enlace de edición y el de respuestas salen en Ver > Registros.
 */
function crearFormulario() {
  var f = FormApp.create('Encuesta de usuarios: juego de cartas BarajaArch')
  f.setDescription(
    'Gracias por probar el juego. Esta encuesta toma unos 5 minutos. No se evalúa a la persona sino al juego, ' +
    'así que no hay respuestas correctas ni incorrectas. Tus respuestas se guardan con un código anónimo y solo se ' +
    'usan en el informe de un trabajo de la Universidad Nacional de Colombia. Puedes dejar de responder cuando quieras.')
  f.setCollectEmail(false)
  f.setConfirmationMessage('Gracias por participar.')

  var cinco = ['1', '2', '3', '4', '5']

  // Sección 1
  f.addTextItem().setTitle('Código de participante').setHelpText('Te lo da quien modera la prueba (por ejemplo U01).').setRequired(true)
  f.addPageBreakItem().setTitle('1. Sobre ti')
  f.addMultipleChoiceItem().setTitle('¿Con qué frecuencia juegas juegos de cartas (físicos o digitales)?')
    .setChoiceValues(['Casi nunca', 'Alguna vez al mes', 'Cada semana', 'Casi todos los días']).setRequired(true)
  f.addMultipleChoiceItem().setTitle('¿Conocías antes las reglas de Clásica 4-3-3 o de Apuntado 101?')
    .setChoiceValues(['Ninguna', 'Una de las dos', 'Las dos']).setRequired(true)
  f.addMultipleChoiceItem().setTitle('¿Desde qué dispositivo jugaste?')
    .setChoiceValues(['Computador', 'Celular', 'Tableta']).setRequired(true)

  // Sección 2
  f.addPageBreakItem().setTitle('2. Cómo te fue en las tareas').setHelpText('Marca una opción por tarea.')
  f.addGridItem().setTitle('Tareas')
    .setRows([
      'Entrar con nombre y PIN',
      'Crear una sala o unirme con el código de 6 caracteres',
      'Robar y descartar una carta en mi turno',
      'Organizar mi mano arrastrando las cartas',
      'Decidir cuándo pulsar Cerrar ronda',
      'Entender el marcador al terminar la ronda'])
    .setColumns(['La hice sola/o sin ayuda', 'La hice con una ayuda', 'No pude hacerla']).setRequired(true)

  // Sección 3
  f.addPageBreakItem().setTitle('3. Valoración general')
  f.addScaleItem().setTitle('¿Qué tan satisfecho/a quedaste con la experiencia?')
    .setBounds(1, 5).setLabels('Muy insatisfecho/a', 'Muy satisfecho/a').setRequired(true)
  f.addScaleItem().setTitle('¿Qué tan rápido respondió el juego a tus acciones?')
    .setBounds(1, 5).setLabels('Muy lento', 'Inmediato').setRequired(true)
  f.addScaleItem().setTitle('¿Qué tan claras te parecieron las reglas del modo que jugaste?')
    .setBounds(1, 5).setLabels('Nada claras', 'Muy claras').setRequired(true)
  f.addScaleItem().setTitle('¿Qué tan fácil fue entender el botón de ayuda (?) de cada modo?')
    .setBounds(1, 5).setLabels('Muy difícil', 'Muy fácil').setRequired(true)
  f.addScaleItem().setTitle('¿Qué tan justo te pareció perder 5 puntos por cerrar con la mano mal armada?')
    .setBounds(1, 5).setLabels('Nada justo', 'Muy justo').setRequired(true)

  // Sección 4: SUS
  f.addPageBreakItem().setTitle('4. Cuestionario de usabilidad (SUS)')
    .setHelpText('Marca qué tan de acuerdo estás con cada frase. 1 es totalmente en desacuerdo y 5 es totalmente de acuerdo. Responde sin pensarlo demasiado.')
  f.addGridItem().setTitle('Afirmaciones')
    .setRows([
      '1. Creo que me gustaría usar este juego con frecuencia.',
      '2. Encontré el juego innecesariamente complejo.',
      '3. Pensé que el juego era fácil de usar.',
      '4. Creo que necesitaría ayuda de una persona con conocimientos técnicos para poder usar el juego.',
      '5. Encontré que las diferentes funciones del juego estaban bien integradas.',
      '6. Pensé que había demasiada inconsistencia en el juego.',
      '7. Imagino que la mayoría de las personas aprenderían a usar este juego muy rápido.',
      '8. Encontré el juego muy incómodo de usar.',
      '9. Me sentí muy seguro/a usando el juego.',
      '10. Necesité aprender muchas cosas antes de poder empezar a jugar.'])
    .setColumns(cinco).setRequired(true)

  // Sección 5
  f.addPageBreakItem().setTitle('5. Preguntas abiertas')
  f.addParagraphTextItem().setTitle('¿Qué fue lo que más te gustó?')
  f.addParagraphTextItem().setTitle('¿En qué momento te confundiste o no supiste qué hacer?')
  f.addParagraphTextItem().setTitle('¿Hubo algo del juego que te pareció lento, raro o que no funcionó?')
  f.addParagraphTextItem().setTitle('Si pudieras cambiar una sola cosa, ¿cuál sería?')
  f.addParagraphTextItem().setTitle('¿Recomendarías el juego a un amigo? ¿Por qué?')

  Logger.log('Editar: ' + f.getEditUrl())
  Logger.log('Compartir con participantes: ' + f.getPublishedUrl())
}
