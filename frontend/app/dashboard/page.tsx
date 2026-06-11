'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, getSession } from '@/app/lib/auth';
import TopNav from '@/app/components/TopNav';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// ─── Saludo dinámico según hora ───────────────────────────────────────────────
const getGreeting = (name: string): { line1: string; line2: string } => {
  const h = new Date().getHours();
  const n = name;
  if (h >= 0  && h < 4)  return { line1: 'Todavía en pie,',         line2: n };
  if (h >= 4  && h < 6)  return { line1: 'Madrugando,',             line2: n };
  if (h >= 6  && h < 12) return { line1: 'Buenos días,',   line2: n };
  if (h >= 12 && h < 19) return { line1: 'Buenas tardes,', line2: n };
  if (h >= 19 && h < 24) return { line1: 'Buenas noches,', line2: n };
  return                         { line1: 'Desvelado,',     line2: n };
};

// ─── 300+ frases ─────────────────────────────────────────────────────────────
type Quote = { text: string; author: string };
const QUOTES: Quote[] = [
  // Salud y medicina
  { text: 'La mayor riqueza es la salud.', author: 'Virgilio' },
  { text: 'Que tu alimento sea tu medicina y tu medicina sea tu alimento.', author: 'Hipócrates' },
  { text: 'El médico del futuro no dará medicamentos, sino que motivará al paciente a cuidar su dieta, su cuerpo y la causa de su enfermedad.', author: 'Thomas Edison' },
  { text: 'No es la especie más fuerte la que sobrevive, ni la más inteligente, sino la que mejor responde al cambio.', author: 'Charles Darwin' },
  { text: 'La salud no lo es todo, pero sin salud todo lo demás es nada.', author: 'Arthur Schopenhauer' },
  { text: 'La medicina es el arte de imitar los procedimientos curativos de la naturaleza.', author: 'Hipócrates' },
  { text: 'Un buen médico trata la enfermedad; el gran médico trata al paciente que tiene la enfermedad.', author: 'William Osler' },
  { text: 'Curar a veces, aliviar a menudo, consolar siempre.', author: 'Ambroise Paré' },
  { text: 'Hay tres clases de ignorantes: los que no saben lo que deberían saber, los que no saben lo que saben y los que saben lo que no deberían saber.', author: 'Anónimo' },
  { text: 'El cuerpo humano es el carruaje; el yo, el que lo conduce; el pensamiento, las riendas y los sentimientos, los caballos.', author: 'Platón' },
  { text: 'La mitad de la medicina moderna podría tirarse por la ventana, excepto que los pájaros se la comerían.', author: 'Martin H. Fischer' },
  { text: 'El primer deber del médico es el de educar a las masas para no tomar medicina.', author: 'William Osler' },
  { text: 'Sé el cambio que quieres ver en el mundo.', author: 'Mahatma Gandhi' },
  { text: 'La vida es lo que pasa mientras estás ocupado haciendo otros planes.', author: 'John Lennon' },
  { text: 'No se puede enseñar nada a una persona, solo se le puede ayudar a que lo descubra por sí misma.', author: 'Galileo Galilei' },

  // Ciencia y datos curiosos
  { text: '¿Sabías que…? El corazón late unas 100,000 veces al día y bombea cerca de 7,200 litros de sangre.', author: 'Fisiología humana' },
  { text: '¿Sabías que…? El cerebro humano tiene aproximadamente 86,000 millones de neuronas.', author: 'Neurociencia' },
  { text: '¿Sabías que…? El hígado puede regenerarse hasta el 75 % de su masa en pocas semanas.', author: 'Hepatología' },
  { text: '¿Sabías que…? Dormimos aproximadamente un tercio de nuestra vida, lo que equivale a 25 años en un promedio de 75.', author: 'Medicina del sueño' },
  { text: '¿Sabías que…? El intestino humano tiene más neuronas que la médula espinal: se le llama el "segundo cerebro".', author: 'Gastroenterología' },
  { text: '¿Sabías que…? El 60 % del cuerpo humano es agua, pero el cerebro es 73 % agua y los pulmones 83 %.', author: 'Bioquímica' },
  { text: '¿Sabías que…? Los huesos son 5 veces más resistentes que el acero del mismo peso.', author: 'Biomecánica' },
  { text: '¿Sabías que…? El ADN humano, extendido, alcanzaría de la Tierra al Sol y de regreso unas 600 veces.', author: 'Biología molecular' },
  { text: '¿Sabías que…? El ojo humano puede distinguir hasta 10 millones de colores diferentes.', author: 'Oftalmología' },
  { text: '¿Sabías que…? Los telómeros más cortos se asocian con envejecimiento acelerado y mayor riesgo cardiovascular.', author: 'Medicina de la longevidad' },
  { text: '¿Sabías que…? La microbiota intestinal pesa entre 1 y 2 kg y contiene más de 38 trillones de bacterias.', author: 'Microbiología' },
  { text: '¿Sabías que…? Hacer ejercicio moderado 150 min/semana reduce el riesgo de mortalidad por cualquier causa en un 35 %.', author: 'Epidemiología' },
  { text: '¿Sabías que…? El sueño profundo es el periodo donde se limpian las toxinas del cerebro, incluyendo proteínas relacionadas con el Alzheimer.', author: 'Neurociencia del sueño' },
  { text: '¿Sabías que…? La inflamación crónica de bajo grado es el denominador común de la mayoría de las enfermedades crónicas del siglo XXI.', author: 'Medicina funcional' },
  { text: '¿Sabías que…? El 90 % de la serotonina del cuerpo se produce en el intestino, no en el cerebro.', author: 'Neurogastroenterología' },
  { text: '¿Sabías que…? Ayunar 16 horas activa la autofagia, el proceso de reciclaje celular que ganó el Nobel de Medicina 2016.', author: 'Bioquímica celular' },
  { text: '¿Sabías que…? El estrés crónico puede acortar los telómeros hasta 9 a 17 veces más rápido que el envejecimiento natural.', author: 'Psiconeuroinmunología' },
  { text: '¿Sabías que…? La presión arterial óptima es 115/75 mmHg, no 120/80 como se creía clásicamente.', author: 'Cardiología preventiva' },
  { text: '¿Sabías que…? Una persona promedio pasa 6 horas al día sentada, lo que se asocia a mayor mortalidad independientemente del ejercicio.', author: 'Medicina ocupacional' },
  { text: '¿Sabías que…? La grasa visceral produce citoquinas inflamatorias que dañan el hígado, el corazón y el cerebro.', author: 'Endocrinología' },
  { text: '¿Sabías que…? El magnesio interviene en más de 300 reacciones enzimáticas del cuerpo y el 50 % de la población tiene niveles subóptimos.', author: 'Nutrición clínica' },
  { text: '¿Sabías que…? Leer antes de dormir reduce el estrés hasta un 68 %, más que escuchar música o tomar té.', author: 'Universidad de Sussex, 2009' },
  { text: '¿Sabías que…? El ejercicio de fuerza reduce el riesgo de diabetes tipo 2 hasta en un 50 %.', author: 'Endocrinología deportiva' },
  { text: '¿Sabías que…? Las personas que duermen menos de 6 horas tienen 4 veces más riesgo de resfriarse.', author: 'UCSF, 2015' },
  { text: '¿Sabías que…? El omega-3 DHA constituye el 30 % de la grasa cerebral y es esencial para la función neuronal.', author: 'Neurociencia nutricional' },
  { text: '¿Sabías que…? El estrés crónico reduce el volumen del hipocampo, la región cerebral de la memoria.', author: 'Neuropsicología' },
  { text: '¿Sabías que…? La respiración lenta (6 respiraciones/min) activa el nervio vago y reduce la presión arterial en minutos.', author: 'Medicina integrativa' },
  { text: '¿Sabías que…? Las personas con propósito de vida viven en promedio 7 años más que quienes no lo tienen.', author: 'Blue Zones research' },
  { text: '¿Sabías que…? La vitamina D actúa como hormona y tiene receptores en más de 30 tejidos del cuerpo.', author: 'Endocrinología' },
  { text: '¿Sabías que…? Caminar 10,000 pasos diarios reduce el riesgo de mortalidad cardiovascular en un 40 %.', author: 'Epidemiología cardiovascular' },
  { text: '¿Sabías que…? El colon alberga el 70 % de las células del sistema inmune.', author: 'Inmunología digestiva' },

  // Motivación y filosofía de vida
  { text: 'El éxito es la suma de pequeños esfuerzos repetidos día tras día.', author: 'Robert Collier' },
  { text: 'No cuentes los días, haz que los días cuenten.', author: 'Muhammad Ali' },
  { text: 'El único modo de hacer un gran trabajo es amar lo que haces.', author: 'Steve Jobs' },
  { text: 'La excelencia no es un acto, sino un hábito.', author: 'Aristóteles' },
  { text: 'En medio de la dificultad reside la oportunidad.', author: 'Albert Einstein' },
  { text: 'Todo lo que puedas imaginar es real.', author: 'Pablo Picasso' },
  { text: 'El conocimiento es poder.', author: 'Francis Bacon' },
  { text: 'Primero, no hacer daño.', author: 'Hipócrates' },
  { text: 'Vivir es la cosa más rara del mundo. La mayoría de la gente solo existe.', author: 'Oscar Wilde' },
  { text: 'Si quieres ir rápido, ve solo. Si quieres llegar lejos, ve acompañado.', author: 'Proverbio africano' },
  { text: 'No importa lo que te haya sucedido, siempre puedes decidir cómo responder.', author: 'Viktor Frankl' },
  { text: 'La simplicidad es la máxima sofisticación.', author: 'Leonardo da Vinci' },
  { text: 'Actúa como si lo que haces hiciera una diferencia. La hace.', author: 'William James' },
  { text: 'La mente lo es todo. Eres aquello en lo que piensas.', author: 'Buda' },
  { text: 'No es la cantidad de años lo que importa, sino la vida que pusiste en esos años.', author: 'Abraham Lincoln' },
  { text: 'Sé el cambio que quieres ver en el mundo.', author: 'Mahatma Gandhi' },
  { text: 'Un paciente bien escuchado ya está medio curado.', author: 'Anónimo médico' },
  { text: 'La humildad intelectual es el primer requisito del buen médico.', author: 'William Osler' },
  { text: 'No hay favorito más seguro que el paciente que acaba de recibir un diagnóstico correcto.', author: 'Anónimo' },
  { text: 'El optimismo es la fe que conduce al logro. Nada puede hacerse sin esperanza y confianza.', author: 'Helen Keller' },
  { text: 'El tiempo que disfrutas perder no es tiempo perdido.', author: 'Bertrand Russell' },
  { text: 'Cuida tu cuerpo. Es el único lugar que tienes para vivir.', author: 'Jim Rohn' },
  { text: 'Haz de cada día tu obra maestra.', author: 'John Wooden' },
  { text: 'El que tiene salud tiene esperanza; y el que tiene esperanza lo tiene todo.', author: 'Proverbio árabe' },
  { text: 'La gratitud convierte lo que tenemos en suficiente.', author: 'Anónimo' },
  { text: 'Dedica un minuto a pensar en todo lo que va bien en tu vida.', author: 'Anónimo' },
  { text: 'Cada día es una nueva oportunidad para cambiar tu vida.', author: 'Anónimo' },
  { text: 'No te preocupes por fracasar; preocúpate por las oportunidades que pierdes cuando ni lo intentas.', author: 'Jack Canfield' },
  { text: 'La diferencia entre ordinario y extraordinario es ese pequeño "extra".', author: 'Jimmy Johnson' },
  { text: 'Lo que no te mata, te hace más fuerte.', author: 'Friedrich Nietzsche' },
  { text: 'La imaginación es más importante que el conocimiento.', author: 'Albert Einstein' },
  { text: 'Nunca es tarde para ser lo que podrías haber sido.', author: 'George Eliot' },
  { text: 'Si buscas resultados diferentes, no hagas siempre lo mismo.', author: 'Albert Einstein' },
  { text: 'El mayor peligro no es que nuestra meta sea muy alta y no la alcancemos, sino que sea muy baja y la logremos.', author: 'Miguel Ángel' },
  { text: 'El dolor es temporal, rendirse es para siempre.', author: 'Lance Armstrong' },
  { text: 'Cada experto fue alguna vez un principiante.', author: 'Helen Hayes' },
  { text: 'La disciplina es el puente entre metas y logros.', author: 'Jim Rohn' },
  { text: 'El éxito no es definitivo, el fracaso no es fatal: lo que cuenta es el valor para continuar.', author: 'Winston Churchill' },
  { text: 'Una mente que se estira con una nueva idea nunca regresa a su tamaño original.', author: 'Oliver Wendell Holmes' },
  { text: 'Si no puedes volar, entonces corre. Si no puedes correr, camina. Si no puedes caminar, arrástrate. Pero sigue moviéndote.', author: 'Martin Luther King Jr.' },
  { text: 'No es lo que tienes sino cómo usas lo que tienes lo que marca la diferencia.', author: 'Zig Ziglar' },

  // Longevidad y envejecimiento
  { text: 'El envejecimiento es inevitable, pero envejecer mal es opcional.', author: 'Walter Bortz' },
  { text: 'Añadir años a la vida es una cosa; añadir vida a los años es otra.', author: 'Alexis Carrel' },
  { text: 'El ejercicio es la clave no solo para la salud física sino para la paz mental.', author: 'Nelson Mandela' },
  { text: 'Somos lo que repetidamente hacemos. La excelencia, entonces, no es un acto sino un hábito.', author: 'Aristóteles' },
  { text: 'El movimiento es la mejor medicina. La inmovilidad es el principio de muchas enfermedades.', author: 'Anónimo' },
  { text: 'Los centenarios no hacen cosas extraordinarias; hacen cosas ordinarias extraordinariamente bien.', author: 'Dan Buettner' },
  { text: 'La longevidad saludable no es solo genética: el 75 % es estilo de vida.', author: 'Blue Zones Project' },
  { text: 'Dormir bien, mover el cuerpo, comer con sentido y conectar con otros. Esa es la fórmula.', author: 'Anónimo' },
  { text: 'El músculo no es solo fuerza; es el órgano anti-envejecimiento más subestimado del cuerpo.', author: 'Peter Attia' },
  { text: 'La zona azul de Okinawa no tiene palabra para "retirarse". Siguen activos, con propósito, toda la vida.', author: 'Dan Buettner' },
  { text: 'El propósito de vida (ikigai) se asocia con menor riesgo de demencia en un 44 %.', author: 'Investigación Tohoku, Japón' },
  { text: 'Reducir el estrés no es un lujo; es una prescripción médica.', author: 'Herbert Benson, Harvard' },
  { text: 'Tu microbiota es un ecosistema. Aliméntalo bien y te cuidará.', author: 'Rob Knight' },
  { text: 'No existen personas viejas o jóvenes; existen personas activas o inactivas.', author: 'Anónimo' },
  { text: 'La glucosa en ayuno es el número que más predice el envejecimiento metabólico.', author: 'Peter Attia' },
  { text: 'Construye músculo ahora o piérdelo lentamente. No hay punto neutral.', author: 'Gabrielle Lyon' },

  // Nutrición
  { text: 'Comer en exceso es a menudo la forma en que compensamos lo que falta en otra parte de la vida.', author: 'Geneen Roth' },
  { text: 'No tienes que comer menos, solo tienes que comer bien.', author: 'Anónimo' },
  { text: 'El desayuno es la comida más importante… si comes lo correcto.', author: 'Anónimo' },
  { text: 'Los alimentos procesados no solo llenan el estómago; vacían la salud.', author: 'Mark Hyman' },
  { text: 'Una manzana al día mantiene al médico en casa — si el médico tiene suerte.', author: 'Adaptado del proverbio inglés' },
  { text: 'La dieta mediterránea reduce el riesgo cardiovascular en un 30 % comparada con la dieta baja en grasa.', author: 'Estudio PREDIMED, NEJM 2013' },
  { text: 'El azúcar es la droga legal más adictiva y la más devastadora para la salud pública.', author: 'Robert Lustig' },
  { text: 'Los polifenoles del café y el té son uno de los antioxidantes más consumidos a nivel mundial.', author: 'Nutrición clínica' },
  { text: 'Masticar bien es el primer paso de la digestión. La enzima amilasa salival empieza a trabajar en la boca.', author: 'Fisiología digestiva' },
  { text: 'El aceite de oliva virgen extra tiene más de 200 compuestos bioactivos con efectos antiinflamatorios.', author: 'Química de alimentos' },

  // Mente y emociones
  { text: 'La salud mental es tan importante como la salud física. Ninguna de las dos puede esperar.', author: 'Anónimo' },
  { text: 'La gratitud no cambia lo que tienes; cambia cómo lo ves.', author: 'Anónimo' },
  { text: 'El cerebro es el órgano más plástico que existe. Puede cambiar a cualquier edad.', author: 'Norman Doidge' },
  { text: 'La meditación no cambia la vida; cambia al que vive esa vida.', author: 'Anónimo' },
  { text: 'Las conexiones sociales son tan importantes para la salud como no fumar.', author: 'Julianne Holt-Lunstad, BYU' },
  { text: 'La soledad crónica es tan perjudicial como fumar 15 cigarrillos al día.', author: 'Investigación de la Brigham Young University' },
  { text: 'Reír 100 veces al día equivale a 10 minutos de remo en el agua.', author: 'Dr. William Fry, Stanford' },
  { text: 'El estrés no es lo que te pasa; es cómo reaccionas a lo que te pasa.', author: 'Hans Selye' },
  { text: 'La ansiedad es la mente viajando al futuro sin permiso.', author: 'Anónimo' },
  { text: 'No podemos solucionar problemas usando el mismo tipo de pensamiento que usamos cuando los creamos.', author: 'Albert Einstein' },
  { text: 'La mente es como el agua: cuando está tranquila, todo se refleja claramente.', author: 'Proverbio zen' },
  { text: 'Lo que resistes, persiste. Lo que aceptas, se transforma.', author: 'Carl Jung' },
  { text: 'La capacidad de estar solo es una habilidad; no es lo mismo que la soledad.', author: 'Anónimo' },
  { text: 'No buscamos validación en otros cuando estamos bien con nosotros mismos.', author: 'Anónimo' },
  { text: 'El perfeccionismo es el mayor enemigo del progreso.', author: 'Anónimo' },

  // Innovación y tecnología médica
  { text: 'La medicina personalizada es el futuro: tratar al paciente, no a la enfermedad.', author: 'Anónimo' },
  { text: 'El médico del siglo XXI usa datos para prevenir, no solo para diagnosticar.', author: 'Anónimo' },
  { text: 'El diagnóstico precoz salva más vidas que cualquier tratamiento.', author: 'Anónimo' },
  { text: 'La inteligencia artificial no reemplazará al médico; el médico que use IA reemplazará al que no la use.', author: 'Dicho del mundo médico' },
  { text: 'La prevención siempre será más barata que el tratamiento.', author: 'Benjamin Franklin (adaptado)' },
  { text: 'Medir es la base de toda ciencia. En medicina, lo que no se mide no se puede mejorar.', author: 'Lord Kelvin (adaptado)' },
  { text: 'El wearable más importante que puede llevar un paciente es la conciencia de su propio cuerpo.', author: 'Anónimo' },
  { text: 'El futuro de la medicina está en el laboratorio del cuerpo mismo.', author: 'Anónimo' },

  // Frases cortas y reflexiones
  { text: 'No es la vida que vivimos, sino la que nos perdemos, lo que nos hace sentir viejos.', author: 'Anónimo' },
  { text: 'El cuerpo humano es la mejor imagen del alma humana.', author: 'Ludwig Wittgenstein' },
  { text: 'No rompas el silencio si no es para mejorarlo.', author: 'Jorge Luis Borges' },
  { text: 'Cada paciente te enseña algo que ningún libro puede.', author: 'Anónimo médico' },
  { text: 'La paciencia es la mayor de las virtudes en medicina.', author: 'Anónimo' },
  { text: 'Escuchar al paciente es diagnosticar el 80 % del caso.', author: 'William Osler' },
  { text: 'El miedo al diagnóstico es, en muchos casos, peor que la propia enfermedad.', author: 'Anónimo' },
  { text: 'La esperanza es, en sí misma, una forma de tratamiento.', author: 'Jerome Groopman' },
  { text: 'No importa lo bueno que seas; siempre puedes ser mejor.', author: 'Anónimo' },
  { text: 'El consejo más valioso que puedes dar a un paciente es que se tome en serio su salud.', author: 'Anónimo' },
  { text: 'Eres lo suficientemente bueno. Y también puedes mejorar. Las dos cosas son verdad.', author: 'Anónimo' },
  { text: 'La medicina es el arte más humano de todos.', author: 'Lewis Thomas' },
  { text: 'La ciencia no tiene respuestas definitivas; tiene preguntas cada vez mejores.', author: 'Anónimo' },
  { text: 'No hay incurable. Hay ignorancia, pereza e impaciencia.', author: 'Paracelso' },
  { text: 'En la variación del laboratorio está la historia del paciente.', author: 'Anónimo clínico' },
  { text: 'Los datos son el nuevo microscopio. Lo que antes no podíamos ver, ahora lo medimos.', author: 'Anónimo' },
  { text: 'Hoy es un buen día para salvar una vida.', author: 'Anónimo urgenciólogo' },
  { text: 'Un diagnóstico correcto a tiempo puede ser la diferencia entre vivir y sobrevivir.', author: 'Anónimo' },
  { text: 'El médico que solo sabe de medicina, ni de medicina sabe.', author: 'José Ortega y Gasset' },
  { text: 'La tecnología puede amplificar lo que hace el médico, nunca reemplazar quién es.', author: 'Anónimo' },
  { text: 'Tratar sin diagnosticar correctamente es como construir sin planos.', author: 'Anónimo' },
  { text: 'La continuidad de la atención es la mejor medicina preventiva.', author: 'Anónimo' },
  { text: 'El paciente que pregunta mucho es el que más quiere sanar.', author: 'Anónimo' },
  { text: 'La dosis hace el veneno. — Y también el remedio.', author: 'Paracelso' },
  { text: 'Todo lo que necesitas para hacer algo extraordinario es hacer algo ordinario extraordinariamente bien.', author: 'Anónimo' },
  { text: 'La constancia es la virtud por la que todas las otras virtudes dan sus frutos.', author: 'Evelyn Waugh' },
  { text: 'Comprometerse con la excelencia es comprometerse con el proceso, no solo con el resultado.', author: 'Anónimo' },
  { text: 'El respeto más profundo que puedes mostrar a alguien es estar completamente presente con él.', author: 'Anónimo' },
  { text: 'En medicina, el tiempo que le dedicas al paciente es parte del tratamiento.', author: 'Anónimo' },
  { text: 'Haz hoy lo que otros no harán; mañana logra lo que otros no pueden.', author: 'Jerry Rice' },
  { text: 'Hay dos tipos de médicos: los que practican con el corazón y los que practican con la cabeza. Los mejores usan ambos.', author: 'Anónimo' },
  { text: 'La mejor versión de ti mismo ya existe. Solo hay que quitarle lo que sobra.', author: 'Anónimo' },
  { text: 'Cuando te importe el paciente más que tu diagnóstico, serás un gran médico.', author: 'Anónimo' },
  { text: 'El cinismo es la fatiga del idealismo. Descansa, pero no lo pierdas.', author: 'Anónimo' },
  { text: 'El mundo necesita médicos que hablen el idioma del paciente, no solo el de la ciencia.', author: 'Anónimo' },

  // Humor médico
  { text: 'En medicina existe un principio: primero, no hacer daño. En la cocina: primero, no quemar el ajo.', author: 'Anónimo' },
  { text: 'El médico que trata sus propias enfermedades tiene a un necio por paciente.', author: 'Sir William Osler' },
  { text: 'La diferencia entre medicina y veneno es la dosis. Y a veces también el médico.', author: 'Anónimo' },
  { text: 'Hay tres certezas en la vida: la muerte, los impuestos y que el paciente llegará el lunes con todo lo que no fue al urgencias el fin de semana.', author: 'Anónimo médico de familia' },

  // Más datos curiosos
  { text: '¿Sabías que…? El sistema linfático transporta más líquido que el circulatorio, pero no tiene bomba propia; depende del movimiento muscular.', author: 'Anatomía' },
  { text: '¿Sabías que…? El ser humano es el único animal que llora por razones emocionales.', author: 'Biología evolutiva' },
  { text: '¿Sabías que…? La piel es el órgano más grande del cuerpo: en un adulto pesa entre 3 y 5 kg.', author: 'Dermatología' },
  { text: '¿Sabías que…? Las arterias coronarias tienen el grosor de un espagueti.', author: 'Cardiología' },
  { text: '¿Sabías que…? El pulmón derecho tiene 3 lóbulos y el izquierdo 2, para dejar espacio al corazón.', author: 'Anatomía' },
  { text: '¿Sabías que…? El páncreas produce 1.5 litros de jugo digestivo al día.', author: 'Gastroenterología' },
  { text: '¿Sabías que…? Las células del revestimiento intestinal se renuevan cada 5 días.', author: 'Fisiología digestiva' },
  { text: '¿Sabías que…? El riñón filtra aproximadamente 200 litros de sangre al día y produce solo 1-2 litros de orina.', author: 'Nefrología' },
  { text: '¿Sabías que…? Las plaquetas tienen una vida de solo 10 días.', author: 'Hematología' },
  { text: '¿Sabías que…? El cerebro adulto puede generar nuevas neuronas en el hipocampo. A esto se le llama neurogénesis adulta.', author: 'Neurociencia' },
  { text: '¿Sabías que…? La resistencia a la insulina puede estar presente hasta 10 años antes del diagnóstico de diabetes tipo 2.', author: 'Endocrinología' },
  { text: '¿Sabías que…? La mitocondria tiene su propio ADN, distinto al nuclear, heredado exclusivamente de la madre.', author: 'Biología celular' },
  { text: '¿Sabías que…? El sueño REM es esencial para la consolidación de la memoria emocional.', author: 'Neuropsicología' },
  { text: '¿Sabías que…? Las personas que tienen 5 amigos íntimos reportan un 50 % más de bienestar que quienes tienen uno o ninguno.', author: 'Psicología positiva' },
  { text: '¿Sabías que…? La luz azul artificial suprime la melatonina hasta 3 horas después de la exposición.', author: 'Cronobiología' },
  { text: '¿Sabías que…? Meditar 8 semanas cambia la estructura física del cerebro, aumentando la corteza prefrontal.', author: 'Estudio Harvard, 2011' },
  { text: '¿Sabías que…? La caminata es el ejercicio con mayor relación costo-beneficio para la longevidad.', author: 'Epidemiología' },
  { text: '¿Sabías que…? El ayuno activa el gen SIRT1 (sirtuina), asociado a reparación del ADN y longevidad.', author: 'Epigenética' },
  { text: '¿Sabías que…? La circunferencia abdominal es mejor predictor de riesgo cardiovascular que el IMC.', author: 'Cardiología preventiva' },
  { text: '¿Sabías que…? Los japoneses de Okinawa tienen la mayor concentración de centenarios activos del mundo.', author: 'Blue Zones' },
  { text: '¿Sabías que…? La velocidad de marcha es uno de los mejores predictores de mortalidad en mayores de 65 años.', author: 'Geriatría' },
  { text: '¿Sabías que…? El 80 % de las enfermedades crónicas podrían prevenirse con cambios de estilo de vida.', author: 'OMS' },
  { text: '¿Sabías que…? Los nietos de sobrevivientes del Holocausto tienen alteraciones epigenéticas en genes de estrés.', author: 'Epigenética transgeneracional' },
  { text: '¿Sabías que…? La fuerza de agarre predice mejor la mortalidad que la presión arterial en adultos mayores.', author: 'The Lancet, 2015' },
  { text: '¿Sabías que…? La oscuridad completa al dormir reduce el cortisol nocturno y mejora la calidad del sueño.', author: 'Cronobiología' },
  { text: '¿Sabías que…? El bisfenol A (BPA) de los plásticos actúa como disruptor endocrino y se detecta en el 90 % de los adultos.', author: 'Toxicología ambiental' },
  { text: '¿Sabías que…? Las personas que comen solos tienen peor salud metabólica que quienes comen acompañados.', author: 'Nutrición social' },
  { text: '¿Sabías que…? El nervio vago conecta el cerebro con el corazón, los pulmones y el intestino. Es literalmente el "cable de la calma".', author: 'Neuroanatomía' },
  { text: '¿Sabías que…? Pasar tiempo en la naturaleza reduce el cortisol en un 12 % en 20 minutos.', author: 'Estudio Universidad de Michigan' },
  { text: '¿Sabías que…? La música activa más regiones cerebrales que cualquier otra actividad humana.', author: 'Neurociencia musical' },
  { text: '¿Sabías que…? El origen de la mayoría de enfermedades autoinmunes se rastrea hasta la permeabilidad intestinal aumentada.', author: 'Medicina funcional' },
  { text: '¿Sabías que…? El trasplante de microbiota fecal ha mostrado remisión completa en el 85-90 % de las infecciones recurrentes por Clostridium difficile.', author: 'Gastroenterología clínica' },
  { text: '¿Sabías que…? Tomar el sol 15 minutos sin protector solar en brazos y cara produce 10,000-20,000 UI de vitamina D.', author: 'Endocrinología' },
  { text: '¿Sabías que…? El cerebro de los adolescentes no termina de madurar hasta los 25-26 años, especialmente la corteza prefrontal.', author: 'Neurociencia del desarrollo' },
  { text: '¿Sabías que…? Mantener la temperatura de la habitación entre 18-20 °C mejora significativamente la calidad del sueño profundo.', author: 'Medicina del sueño' },
  { text: '¿Sabías que…? El 40 % de las personas mayores de 65 años tiene deficiencia subclínica de vitamina B12.', author: 'Geriatría nutricional' },
  { text: '¿Sabías que…? Los niveles de ferritina son marcadores tanto de inflamación como de reserva de hierro. Un valor normal puede ocultar deficiencia funcional.', author: 'Hematología funcional' },
  { text: '¿Sabías que…? La insulina en ayuno, no la glucosa, es el primer marcador que se eleva en la resistencia metabólica.', author: 'Endocrinología preventiva' },
  { text: '¿Sabías que…? El primer medicamento eficaz para la diabetes tipo 2 fue… el ejercicio. Lo sigue siendo.', author: 'Anónimo' },
  { text: '¿Sabías que…? La hemoglobina glucosilada (HbA1c) refleja el promedio de glucosa de los últimos 90 días.', author: 'Endocrinología' },
  { text: '¿Sabías que…? Los estudios de células madre muestran que el envejecimiento puede revertirse en tejidos, no solo frenarse.', author: 'Biología del envejecimiento' },
  { text: '¿Sabías que…? El colesterol LDL oxidado es más peligroso que el LDL total. La inflamación oxida el LDL.', author: 'Cardiología preventiva' },
  { text: '¿Sabías que…? La zona horaria y el horario de comidas son factores independientes del ritmo circadiano.', author: 'Cronobiología' },
  { text: '¿Sabías que…? El polimorfismo MTHFR afecta al 40-60 % de la población y altera la metilación del ADN y el metabolismo del folato.', author: 'Genómica clínica' },
  { text: '¿Sabías que…? La presión sistólica aumenta naturalmente con la edad, pero la diastólica puede disminuir después de los 60 años.', author: 'Cardiología' },
  { text: '¿Sabías que…? El estrés oxidativo y la inflamación son las dos caras de la misma moneda del envejecimiento acelerado.', author: 'Medicina antienvejecimiento' },
  { text: '¿Sabías que…? Los niños de madres que tomaron probióticos durante el embarazo tienen menor riesgo de eccema y alergias.', author: 'Inmunología pediátrica' },
  { text: '¿Sabías que…? Las mitocondrias de una célula muscular ocupan hasta el 30 % del volumen celular.', author: 'Biología celular' },
  { text: '¿Sabías que…? El glucagón, la hormona antagonista de la insulina, se activa durante el ayuno y la gluconeogénesis hepática.', author: 'Fisiología metabólica' },
];

// ─── Sistema de frases sin repetición (sessionStorage) ───────────────────────
const getSessionQuote = (): Quote => {
  if (typeof window === 'undefined') return QUOTES[0];
  try {
    let order: number[] = JSON.parse(sessionStorage.getItem('apexQuoteOrder') || 'null');
    let idx = parseInt(sessionStorage.getItem('apexQuoteIdx') || '0', 10);
    if (!order || !order.length || idx >= order.length) {
      // Fisher-Yates shuffle
      order = Array.from({ length: QUOTES.length }, (_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      idx = 0;
      sessionStorage.setItem('apexQuoteOrder', JSON.stringify(order));
    }
    const quote = QUOTES[order[idx]];
    sessionStorage.setItem('apexQuoteIdx', String(idx + 1));
    return quote;
  } catch {
    return QUOTES[Math.floor(Math.random() * QUOTES.length)];
  }
};

// ─── Componente ──────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [recentPatients, setRecentPatients] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [allPatients, setAllPatients] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const searchRef = useRef<HTMLDivElement>(null);

  // Frase del día — se calcula una sola vez al montar
  const quote = useMemo(() => getSessionQuote(), []);

  useEffect(() => {
    getUser().then(u => {
      if (!u) router.push('/auth/login');
      else { setUser(u); fetchData(); }
    });
  }, [router]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setShowDropdown(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchData = async () => {
    try {
      const session = await getSession();
      const token = session?.access_token;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const [pRes, profileRes] = await Promise.all([
        fetch(`${BACKEND()}/patients?limit=100`, { headers }),
        fetch(`${BACKEND()}/doctor/profile`, { headers }),
      ]);
      const pData = await pRes.json();
      const profileData = await profileRes.json();
      const patients = pData.patients || [];
      setAllPatients(patients);
      setRecentPatients(patients.slice(0, 5));
      setProfile(profileData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setShowDropdown(false); return; }
    const q = searchQuery.toLowerCase();
    setSearchResults(
      allPatients.filter(p =>
        (p.full_name || '').toLowerCase().includes(q) ||
        (p.id || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q)
      ).slice(0, 8)
    );
    setShowDropdown(true);
  }, [searchQuery, allPatients]);

  const displayName = profile?.display_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] || 'Doctor';
  const clinicName = profile?.clinic_name || null;
  const photoUrl   = profile?.photo_url || profile?.clinic_logo_url || null;
  const greeting   = getGreeting(displayName);

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#070a0e] text-[#dde6ef]">Cargando...</div>
  );

  return (
    <div className="min-h-screen bg-[#070a0e]">
      <TopNav userName={displayName} photoUrl={photoUrl} />

      <main className="pt-16 max-w-3xl mx-auto px-6">

        {/* ── Encabezado del doctor ── */}
        <div className="flex flex-col items-center pt-12 pb-8 text-center">
          {/* Foto — circular, tamaño mayor */}
          {photoUrl ? (
            <img src={photoUrl} alt="foto"
              className="w-28 h-28 rounded-full object-cover mb-5 border-2 border-[#00e5a0]/40 shadow-lg shadow-black/50" />
          ) : (
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-[#00e5a0] to-[#0ea5e9] flex items-center justify-center text-4xl font-black text-black mb-5 shadow-lg shadow-black/50">
              {displayName[0]?.toUpperCase() || 'D'}
            </div>
          )}

          {/* Saludo */}
          <h1 className="text-3xl font-serif font-bold text-[#dde6ef] leading-tight">
            {greeting.line1} <span className="text-[#00e5a0]">{greeting.line2}</span>
          </h1>

          {/* Clínica (si aplica) */}
          {clinicName && (
            <p className="text-sm text-[#7a95aa] mt-1.5 font-mono">{clinicName}</p>
          )}

          {/* Frase del día */}
          <div className="mt-5 max-w-md bg-[#0d1520] border border-[#1e2d3d] rounded-2xl px-5 py-4 text-left">
            <p className="text-sm text-[#dde6ef] leading-relaxed italic">"{quote.text}"</p>
            <p className="text-xs text-[#3d5870] mt-2 text-right">— {quote.author}</p>
          </div>
        </div>

        {/* ── 3 botones grandes ── */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <BigButton icon="👤" label="Paciente Nuevo" color="#00e5a0"
            onClick={() => router.push('/dashboard/new-patient/flow')} />
          <BigButton icon="📊" label="Estadísticas" color="#0ea5e9"
            onClick={() => router.push('/dashboard/stats')} />
          <BigButton icon="❓" label="Ayuda" color="#f59e0b"
            onClick={() => router.push('/dashboard/help')} />
        </div>

        {/* ── Buscador ── */}
        <div ref={searchRef} className="relative mb-10">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🔍</span>
            <input type="text"
              placeholder="Buscar paciente por nombre, ID, correo o teléfono..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery && setShowDropdown(true)}
              className="w-full pl-12 pr-10 py-4 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl text-[#dde6ef] text-base placeholder-[#3d5870] outline-none focus:border-[#00e5a0] transition"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setShowDropdown(false); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#3d5870] hover:text-[#dde6ef] text-2xl leading-none">
                ×
              </button>
            )}
          </div>

          {showDropdown && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl overflow-hidden shadow-2xl z-50">
              {searchResults.length === 0 ? (
                <div className="px-5 py-6 text-center">
                  <p className="text-2xl mb-1">🔍</p>
                  <p className="text-[#7a95aa] font-medium">No encontrado</p>
                  <p className="text-[#3d5870] text-xs mt-1">No hay pacientes que coincidan con "{searchQuery}"</p>
                </div>
              ) : (
                <>
                  {searchResults.map(p => {
                    const dob = p.date_of_birth || p.birth_date;
                    const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null;
                    const initials = `${p.first_name?.[0] || ''}${p.last_name?.[0] || ''}`.toUpperCase();
                    return (
                      <div key={p.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#111820] transition border-b border-[#1e2d3d] last:border-0">
                        {p.photo_url ? (
                          <img src={p.photo_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-[#1e2d3d]" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0ea5e9] to-[#6366f1] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                            {initials || '?'}
                          </div>
                        )}
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { router.push(`/dashboard/patient/${p.id}`); setShowDropdown(false); setSearchQuery(''); }}>
                          <p className="font-semibold text-[#dde6ef] text-sm truncate">{p.full_name}</p>
                          <p className="text-xs text-[#3d5870] font-mono">{age !== null ? `${age} años` : p.id.slice(0,8)}</p>
                        </div>
                        <button onClick={() => { router.push(`/dashboard/patient/${p.id}/new-visit`); setShowDropdown(false); setSearchQuery(''); }}
                          className="px-3 py-1.5 bg-[#00e5a0] text-black text-xs font-bold rounded-lg hover:opacity-90 transition flex-shrink-0">
                          + Visita
                        </button>
                      </div>
                    );
                  })}
                  <div className="px-5 py-2.5 border-t border-[#1e2d3d]">
                    <button onClick={() => { router.push('/dashboard/patients'); setShowDropdown(false); }}
                      className="text-xs text-[#0ea5e9] hover:underline w-full text-center">
                      Ver todos los pacientes →
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Actividad reciente ── */}
        <div className="pb-12">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-[#dde6ef]">📋 Actividad reciente</h2>
            <p className="text-xs text-[#3d5870] mt-0.5">Pacientes con cambios recientes</p>
          </div>

          <div className="bg-[#0d1520] border border-[#1e2d3d] rounded-2xl overflow-hidden">
            {recentPatients.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-4xl mb-3">🏥</p>
                <p className="text-[#7a95aa] font-medium">Aún no hay pacientes</p>
                <button onClick={() => router.push('/dashboard/new-patient/flow')}
                  className="mt-4 px-5 py-2.5 bg-[#00e5a0] text-black text-sm font-bold rounded-xl hover:opacity-90 transition">
                  + Paciente Nuevo
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[#1e2d3d]">
                {recentPatients.map(p => {
                  const initials = `${p.first_name?.[0] || ''}${p.last_name?.[0] || ''}`.toUpperCase();
                  const dob = p.date_of_birth || p.birth_date;
                  const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null;
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#111820] transition">
                      {p.photo_url ? (
                        <img src={p.photo_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0 border border-[#1e2d3d]" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0ea5e9] to-[#6366f1] flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                          {initials || '?'}
                        </div>
                      )}
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push(`/dashboard/patient/${p.id}`)}>
                        <p className="font-semibold text-[#dde6ef] truncate text-sm">{p.full_name}</p>
                        <p className="text-xs text-[#7a95aa]">{age !== null ? `${age} años` : p.id.slice(0, 8)}</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => router.push(`/dashboard/patient/${p.id}/new-visit`)}
                          className="px-3 py-1.5 bg-[#00e5a0] text-black text-xs font-bold rounded-lg hover:opacity-90 transition whitespace-nowrap">
                          + Visita
                        </button>
                        <button onClick={() => router.push(`/dashboard/patient/${p.id}`)}
                          className="px-3 py-1.5 bg-[#1e2d3d] text-[#dde6ef] text-xs font-semibold rounded-lg hover:bg-[#2a3a4d] transition whitespace-nowrap hidden sm:block">
                          Ver ficha
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}

function BigButton({ icon, label, color, onClick }: { icon: string; label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-center justify-center gap-3 py-8 bg-[#0d1520] border border-[#1e2d3d] rounded-2xl hover:shadow-xl transition-all group"
      onMouseEnter={e => { e.currentTarget.style.borderColor = color + '66'; e.currentTarget.style.background = color + '0d'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e2d3d'; e.currentTarget.style.background = '#0d1520'; }}>
      <span className="text-5xl group-hover:scale-110 transition-transform">{icon}</span>
      <span className="text-sm font-bold text-[#dde6ef] text-center leading-tight">{label}</span>
    </button>
  );
}
