/* Banco de preguntas: 4 regiones x 5 preguntas.
   Economía de 1.º BGU, anclada a la aventura «El Reino de la Economía». */
export const QUESTION_BANK = {
  exam_id: 'zelda-economia-3d-1bgu',
  title: 'El Reino de la Economía',
  subtitle: 'Historia y Ciudadanía · 1BGU',
  points_per_question: 0.5,
  total_questions: 20,
  worlds: [
    {
      id: 1,
      code: 'Región 1',
      name: 'Pradera de la Escasez',
      enemy: 'Guardián de Piedra',
      emoji: '🌿',
      subtopic: 'Escasez, necesidades y deseos, costo de oportunidad, bienes gratuitos y factores de producción',
      questions: [
        {
          id: '1-1',
          q: 'Cada luna, los aldeanos de la Pradera desean más rupias de las que el santuario entrega. ¿Qué concepto describe esa situación?',
          options: [
            'El equilibrio del mercado, pues el santuario ajusta la entrega de rupias a cada precio justo.',
            'La abundancia, pues el santuario guarda rupias de sobra para todas las familias.',
            'La escasez, pues los deseos de los aldeanos superan las rupias que el santuario entrega.',
            'La eficiencia, pues el santuario reparte cada rupia sin perder ninguna de las suyas.'
          ],
          answer: 2,
          subtopic: 'Escasez y recursos limitados',
          difficulty: 1,
          explanation: 'La escasez compara deseos con recursos disponibles, y aquí los deseos son mayores. La abundancia sería lo contrario, y el equilibrio exigiría que oferta y demanda se igualaran.'
        },
        {
          id: '1-2',
          q: 'Un aldeano dedica la tarde a cortar leña y no puede regar su huerto. ¿Qué representa el huerto sin regar?',
          options: [
            'El costo de oportunidad de cortar leña, es decir, el huerto que deja de regar.',
            'El costo monetario de cortar leña, es decir, el precio que paga por el hacha y la cuerda.',
            'El beneficio de cortar leña, es decir, la leña que obtiene al final de la tarde.',
            'El ingreso del aldeano, es decir, lo que gana al vender la leña.'
          ],
          answer: 0,
          subtopic: 'Costo de oportunidad',
          difficulty: 2,
          explanation: 'El costo de oportunidad es el valor de la mejor alternativa sacrificada, no el dinero gastado. Lo que se sacrifica aquí es la cosecha del huerto.'
        },
        {
          id: '1-3',
          q: 'El agua del manantial brota en abundancia y ningún aldeano paga por tomarla. ¿Por qué se considera un bien gratuito?',
          options: [
            'Porque el Estado lo declara de uso público y prohíbe a cualquier aldeano cobrar por él.',
            'Porque no tiene precio ni exige esfuerzo productivo para obtenerse, aunque sea útil.',
            'Porque el manantial pertenece a toda la aldea y por eso no puede venderse a nadie.',
            'Porque su precio es cero solo mientras el manantial conserve agua en el verano.'
          ],
          answer: 1,
          subtopic: 'Bienes gratuitos y bienes económicos',
          difficulty: 2,
          explanation: 'El bien gratuito no tiene precio porque no es escaso ni exige esfuerzo productivo, aunque sigue siendo útil. Que el Estado lo declare de uso público es una decisión política, no una condición económica.'
        },
        {
          id: '1-4',
          q: 'La población de la Pradera crece cada año mientras la tierra cultivable sigue siendo la misma. ¿Qué muestra ese caso?',
          options: [
            'Que la tierra alcanza para todos si cada familia trabaja más.',
            'Que las necesidades se reducen cuando la tierra comienza a escasear.',
            'Que la escasez desaparece cuando la población aprende a cultivar mejor cada parcela.',
            'Que los recursos son limitados y las necesidades de la aldea no se detienen.'
          ],
          answer: 3,
          subtopic: 'Escasez y recursos limitados',
          difficulty: 3,
          explanation: 'La escasez es relativa: compara recursos limitados con necesidades crecientes. Mejorar el cultivo ayuda, pero no elimina el problema mientras la tierra no aumente.'
        },
        {
          id: '1-5',
          q: 'Para reparar el puente, la Pradera aporta piedra de la cantera, brazos de los aldeanos y un carro nuevo. ¿Cómo se clasifican esos tres aportes?',
          options: [
            'Trabajo, capital y recursos naturales, pues el carro también se considera un recurso.',
            'Capital, trabajo y recursos naturales, pues la piedra se paga con rupias del reino.',
            'Recursos naturales, trabajo y capital, pues cada uno es un factor de producción distinto.',
            'Recursos naturales, capital y trabajo, pues el carro y los brazos cumplen la misma función.'
          ],
          answer: 2,
          subtopic: 'Factores de producción',
          difficulty: 3,
          explanation: 'La piedra es un recurso natural, los brazos de los aldeanos son trabajo y el carro es capital, porque fue producido para producir. Las otras opciones alteran ese orden o confunden el carro con el esfuerzo humano.'
        }
      ]
    },
    {
      id: 2,
      code: 'Región 2',
      name: 'Cañón del Intercambio',
      enemy: 'Buitre de las Cumbres',
      emoji: '🦅',
      subtopic: 'Trueque, funciones del dinero, oferta y demanda, precio de equilibrio',
      questions: [
        {
          id: '2-1',
          q: 'En el Cañón, un pastor quiere cambiar queso por sal, pero el salinero no necesita queso. ¿Qué límite del trueque aparece?',
          options: [
            'La falta de dinero, pues sin moneda el pastor no puede pagar el precio de la sal.',
            'La doble coincidencia de deseos, pues ambos deben querer lo que el otro ofrece.',
            'La inflación del queso, pues su precio sube y el salinero pierde poder de compra.',
            'El exceso de oferta, pues sobra queso en el mercado del cañón.'
          ],
          answer: 1,
          subtopic: 'Trueque y sus límites',
          difficulty: 1,
          explanation: 'El trueque exige que las dos partes quieran lo que la otra tiene. Sin esa doble coincidencia el intercambio no ocurre, y por eso aparece el dinero.'
        },
        {
          id: '2-2',
          q: 'Un mercader guarda sus rupias para comprar grano después de la cosecha. ¿Qué función del dinero está usando?',
          options: [
            'Medio de cambio, pues entrega rupias a cambio de los bienes que necesita comprar.',
            'Patrón de pagos diferidos, pues deja anotada la deuda del grano para el año siguiente.',
            'Unidad de cuenta, pues mide el valor de cada saco de grano en rupias.',
            'Depósito de valor, pues conserva poder de compra para una compra que hará después.'
          ],
          answer: 3,
          subtopic: 'Funciones del dinero',
          difficulty: 2,
          explanation: 'Guardar dinero para comprar más adelante es la función de depósito de valor. Las otras funciones sirven para pagar, medir precios o saldar deudas.'
        },
        {
          id: '2-3',
          q: 'El precio de la sal sube en el Cañón y los caravaneros compran menos sal. ¿Qué ocurrió en el mercado?',
          options: [
            'Cambió la cantidad demandada de sal, pues el precio modificó lo que se compra.',
            'Cambió la demanda de sal, pues la curva entera se desplazó a la izquierda.',
            'Cambió la oferta de sal, pues los mercaderes trajeron menos sal al mercado.',
            'Cambió la cantidad ofrecida, pues los productores ajustaron lo que traen al mercado.'
          ],
          answer: 0,
          subtopic: 'Demanda y cantidad demandada',
          difficulty: 2,
          explanation: 'Un cambio en el propio precio mueve la cantidad demandada sobre la misma curva. La demanda solo se desplaza cuando cambian otros factores, como el ingreso o las preferencias.'
        },
        {
          id: '2-4',
          q: 'En el mercado del Cañón sobran sacos de sal a los precios altos y faltan compradores. ¿Qué muestra ese desequilibrio?',
          options: [
            'Un exceso de demanda, pues se busca más sal de la que los mercaderes traen cada semana a la aldea.',
            'Un precio de equilibrio, pues la oferta y la demanda se ajustan por su cuenta.',
            'Un exceso de oferta, pues se ofrece más sal de la que se logra vender al precio actual.',
            'Una escasez de sal, pues los sacos guardados no llegan a todos los compradores.'
          ],
          answer: 2,
          subtopic: 'Precio de equilibrio, escasez y excedente',
          difficulty: 3,
          explanation: 'Cuando la cantidad ofrecida supera la demandada al precio vigente hay exceso de oferta. El precio tiende a bajar hasta acercarse al equilibrio.'
        },
        {
          id: '2-5',
          q: 'Tres mercaderes nuevos llegan a vender sal al Cañón y todos ofrecen el mismo producto. ¿Qué efecto cabe esperar?',
          options: [
            'Sube el precio de la sal, pues hay más vendedores que quieren ganar rupias.',
            'Baja el precio de la sal, pues la mayor competencia amplía la oferta del mercado.',
            'Sube la demanda, pues los mercaderes nuevos también compran sal.',
            'No cambia el precio, pues la sal conserva siempre el mismo valor de uso para la aldea.'
          ],
          answer: 1,
          subtopic: 'Competencia y formación del precio',
          difficulty: 3,
          explanation: 'Más oferentes del mismo bien aumentan la oferta y presionan el precio hacia abajo. La competencia favorece al comprador, no al vendedor que pierde margen.'
        }
      ]
    },
    {
      id: 3,
      code: 'Región 3',
      name: 'Pantano del Esfuerzo',
      enemy: 'Sierpe del Lodo',
      emoji: '🐍',
      subtopic: 'Factores de producción, productividad, división del trabajo, costos y beneficio',
      questions: [
        {
          id: '3-1',
          q: 'En el Pantano, un taller usa tierra firme, juncos, manos de artesanos y un telar nuevo. ¿Cuál de esos elementos es capital?',
          options: [
            'La tierra firme del taller, pues es el espacio donde ocurre la producción.',
            'Los juncos del humedal, pues son la materia prima que se transforma en canastos tejidos.',
            'Las manos de los artesanos, pues aportan el esfuerzo físico de cada jornada.',
            'El telar del taller, pues es un bien producido que sirve para producir otros bienes.'
          ],
          answer: 3,
          subtopic: 'Factores de producción',
          difficulty: 1,
          explanation: 'El capital es un bien producido que se emplea para producir otros bienes, como el telar. La tierra y los juncos son recursos naturales, y el trabajo es el esfuerzo humano.'
        },
        {
          id: '3-2',
          q: 'Un taller produce 300 canastos con 10 artesanos y luego 300 con 15. ¿Qué ocurrió?',
          options: [
            'Aumentó la producción total, pues se fabricaron más canastos que en la jornada anterior.',
            'Bajó la productividad, pues cada artesano produce ahora menos canastos que antes.',
            'Subió la productividad, pues el taller mantuvo la misma producción total.',
            'Aumentó el capital del taller, pues se sumaron más trabajadores a la misma jornada.'
          ],
          answer: 1,
          subtopic: 'Productividad del trabajo',
          difficulty: 2,
          explanation: 'La productividad se mide por trabajador, no por el total. La producción total no cambió, pero se reparte entre más manos y cada una rinde menos.'
        },
        {
          id: '3-3',
          q: 'En el taller del Pantano, cada artesano corta, teje o pinta una sola clase de canasto. ¿Qué ventaja explica esa organización?',
          options: [
            'La división del trabajo, pues cada tarea repetida se hace con más destreza y rapidez.',
            'La ley de rendimientos decrecientes, pues más tareas distintas reducen el esfuerzo diario.',
            'El aumento del capital, pues cada artesano necesita más herramientas propias.',
            'La competencia interna, pues cada artesano busca tejer el mejor canasto del taller.'
          ],
          answer: 0,
          subtopic: 'División del trabajo y especialización',
          difficulty: 2,
          explanation: 'La división del trabajo reparte el proceso en tareas y eleva la destreza de cada trabajador. Los rendimientos decrecientes describen otro fenómeno: sumar insumos a un factor fijo.'
        },
        {
          id: '3-4',
          q: 'El taller suma artesanos al mismo telar y cada nuevo artesano añade menos canastos que el anterior. ¿Qué ley describe eso?',
          options: [
            'La ley de la demanda, pues al sumar artesanos el taller también debe vender más canastos.',
            'La ley de los costos fijos, pues el telar cuesta igual aunque trabajen más personas.',
            'La ley de rendimientos decrecientes, pues el telar fijo limita a cada nuevo artesano.',
            'La ley de la oferta, pues se produce más cuando sube el precio del canasto.'
          ],
          answer: 2,
          subtopic: 'Ley de rendimientos decrecientes',
          difficulty: 3,
          explanation: 'Con un factor fijo, como el único telar, cada trabajador adicional aporta menos que el anterior. Eso es la ley de rendimientos decrecientes, no un problema de demanda.'
        },
        {
          id: '3-5',
          q: 'Un taller vende 100 canastos a 4 rupias cada uno y gasta 250 rupias en insumos y jornales. ¿Qué puede afirmarse?',
          options: [
            'Obtiene un beneficio de 150 rupias, pues el ingreso supera los costos en ese monto.',
            'Obtiene un beneficio de 400 rupias, pues ese es el ingreso total que dejan las ventas.',
            'Tiene una pérdida de 250 rupias, pues los costos superan a los ingresos del taller.',
            'Obtiene un beneficio de 250 rupias, pues ese es el costo que pagó el taller.'
          ],
          answer: 0,
          subtopic: 'Costos de producción y beneficio',
          difficulty: 3,
          explanation: 'El ingreso es 400 rupias y el costo es 250, así que el beneficio es 150. Confundir el ingreso total con el beneficio es el error más frecuente en este cálculo.'
        }
      ]
    },
    {
      id: 4,
      code: 'Región 4',
      name: 'Ruinas del Estado',
      enemy: 'Coloso de Bronce',
      emoji: '🏛️',
      subtopic: 'Impuestos, gasto público, bienes públicos, externalidades y desarrollo',
      questions: [
        {
          id: '4-1',
          q: 'El Coloso cobra a cada mercader una parte de sus ventas para reparar el puente. ¿Qué instrumento aplica?',
          options: [
            'Un impuesto, pues el Estado retira rupias a los mercaderes para pagar el puente.',
            'Un subsidio, pues el Estado entrega rupias a los mercaderes para abaratar sus ventas.',
            'Una transferencia, pues el Estado devuelve a los mercaderes lo que aportaron.',
            'Un precio máximo, pues se fija cuánto puede cobrar cada mercader por su sal.'
          ],
          answer: 0,
          subtopic: 'Impuestos y gasto público',
          difficulty: 1,
          explanation: 'El impuesto es un pago obligatorio que el Estado recauda para financiar el gasto público. El subsidio va en la dirección contraria: el Estado entrega dinero.'
        },
        {
          id: '4-2',
          q: 'El puente del reino lo usan todos los viajeros y nadie puede impedir el paso a quien no paga. ¿Qué tipo de bien es el puente?',
          options: [
            'Un bien privado, pues su mantenimiento cuesta rupias que alguien debe pagar.',
            'Un bien de lujo, pues solo lo disfrutan los viajeros que tienen más rupias.',
            'Un bien público, pues no se puede excluir a nadie y su uso no reduce el paso disponible.',
            'Un bien gratuito, pues no tiene precio y por eso el mercado puede encargarse de producirlo.'
          ],
          answer: 2,
          subtopic: 'Bienes públicos y fallos de mercado',
          difficulty: 2,
          explanation: 'Un bien público no admite exclusión y su consumo no reduce el disponible para otros. Que no tenga precio no lo vuelve gratuito ni asegura que el mercado lo produzca.'
        },
        {
          id: '4-3',
          q: 'Una fundición arroja ceniza al río y los pescadores pierden capturas sin recibir pago alguno. ¿Qué describe ese caso?',
          options: [
            'Un bien público, pues el río beneficia a todos los habitantes de la comarca.',
            'Un subsidio, pues la fundición recibe un pago del Estado por producir más hierro cada año.',
            'Un impuesto, pues la fundición paga al Estado una tasa por usar el agua del río.',
            'Una externalidad negativa, pues un tercero asume un costo que no eligió pagar.'
          ],
          answer: 3,
          subtopic: 'Externalidades',
          difficulty: 2,
          explanation: 'Hay externalidad negativa cuando la actividad de uno impone un costo a terceros que no participaron en la decisión. Los pescadores pierden ingreso sin haber elegido esa pérdida.'
        },
        {
          id: '4-4',
          q: 'El reino sube el impuesto a las tierras de los nobles y destina esas rupias a escuelas del valle. ¿Qué dos funciones del Estado aparecen?',
          options: [
            'Recaudar impuestos y reducir el gasto público, pues el Estado gasta menos de lo que recibe.',
            'Recaudar impuestos y redistribuir el ingreso, pues cobra a unos y financia a otros.',
            'Fijar precios y subsidiar la oferta, pues cambia el precio de las escuelas del valle.',
            'Regular la competencia y privatizar, pues cede las escuelas al mercado.'
          ],
          answer: 1,
          subtopic: 'Distribución del ingreso y gasto público',
          difficulty: 3,
          explanation: 'Cobrar a un grupo y financiar servicios para otro es redistribución del ingreso mediante el gasto público. Reducir el gasto sería lo contrario de lo que ocurre aquí.'
        },
        {
          id: '4-5',
          q: 'Un pueblo tiene más rupias por habitante que hace diez años, pero sus niños siguen sin escuela y enferman por el agua. ¿Qué conclusión es correcta?',
          options: [
            'Hay desarrollo económico, pues el ingreso por habitante aumentó en la década.',
            'Hay desarrollo económico, pues el pueblo produce más que antes.',
            'Hay crecimiento económico y también desarrollo, pues ambos conceptos miden lo mismo.',
            'Hay crecimiento económico, pero no desarrollo, pues faltan mejoras en el bienestar.'
          ],
          answer: 3,
          subtopic: 'Crecimiento y desarrollo económico',
          difficulty: 3,
          explanation: 'El crecimiento económico mide el aumento de la producción; el desarrollo exige además mejoras en salud, educación y bienestar. Tener más ingreso no basta.'
        }
      ]
    }
  ]
};
