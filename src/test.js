// How about using these as a bus template?

/**
 * @param {string} text
 * @param {string} color
 * @param {'left'|'right'} facing
 */
function BusStopLine({ text, color, facing }) {
  const busStopLineCircle = (
    <frame align="center,center" padding="h=2,v=0" gap="10" height="fill" flow="horizontal">
      <ellipse fill={color} width="3" height="3"/>
    </frame>
  );

  const align = facing === 'left'
    ? 'left,center'
    : 'right,center';

  const busLineArrow = facing === 'left'
    ? <polygon points="3,0 0,1.5 3,3" fill={color} />
    : <polygon points="0,0 3,1.5 0,3" fill={color} />;

  const busLineText = (
    <text align={align} fontSize="6" fontFamily="NanumSquare Neo" fill={color} style="Heavy" width="hug" height="hug">
      {text}
    </text>
  );

  const BusStopContent = ({ children }) => (
    <frame align={align} width="hug" height="6" flow="horizontal" clip="false" gap="3" padding="h=2,v=0" fill="#FFFFFF">
      {children}
    </frame>
  );

  if (facing === 'left') {
    return (
      <frame align={align} width="7" height="6" flow="horizontal" clip="false">
        {busStopLineCircle}
        <BusStopContent>{busLineArrow}{busLineText}</BusStopContent>
      </frame>
    )
  } else {
    return (
      <frame align={align} width="7" height="6" flow="horizontal" clip="false">
        <BusStopLineContent>{busLineText}{busLineArrow}</BusStopLineContent>
        {busStopLineCircle}
      </frame>
    )
  }
}

let handSide;

/**
 * @param {string} text
 * @param {{text: string, color: string}[]} buses
 * @param {'left'|'right'|'up'|'down'} facing
 * @param {boolean} hidden
 */
function BusStop({ text, buses, facing, hidden }) {
  let align;
  switch (facing) {
    case 'left': align = handSide === 'left' ? 'center,bottom' : 'center,top'; break;
    case 'right': align = handSide === 'left' ? 'center,top' : 'center,bottom'; break;
    case 'up': align = handSide === 'left' ? 'right,center' : 'left,center'; break;
    case 'down': align = handSide === 'left' ? 'left,center' : 'right,center'; break;
  }

  const busStopText = (
    <frame width="0" height="0" flow="vertical" clip="false">
      <text align={align} fontSize="10" fontFamily="NanumSquare Neo" fill="#000000" style="Heavy" width="hug" height="hug">
        {text}
      </text>
    </frame>
  )

  const BusStopLines = ({ facing, rotation }) => (
    <frame width="7" height="hug" flow="horizontal" gap="-7" clip="false" rotation={rotation}>
      <rectangle width="7" height="fill" fill="#FFFFFF" cornerRadius="3.5" stroke="#000000" strokeWeight="1"></rectangle>
      <frame width="7" height="hug" flow="vertical" clip="false" padding="h=0,v=3">
        {buses.map((bus, index) => <BusStopLine key={index} text={bus.text} color={bus.color} facing={facing} />)}
      </frame>
    </frame>
  )

  if (facing === 'left') {
    return (
      <frame align={align} width="7" height="hug" flow="vertical" clip="false">
        {hidden ? null : busStopText}
        <BusStopLines facing="left" rotation="0" />
      </frame>
    )
  }
  else if (facing === 'right') {
    return (
      <frame align={align} width="7" height="hug" flow="vertical" clip="false">
        <BusStopLines facing="right" rotation="0" />
        {hidden ? null : busStopText}
      </frame>
    )
  }
  else if (facing === 'up') {
    return (
      <frame align={align} width="hug" height="7" flow="horizontal" clip="false">
        {hidden ? null : busStopText}
        <BusStopLines facing="right" rotation="270" />
      </frame>
    )
  }
  else if (facing === 'down') {
    return (
      <frame align={align} width="hug" height="7" flow="horizontal" clip="false">
        <BusStopLines facing="left" rotation="270" />
        {hidden ? null : busStopText}
      </frame>
    )
  }
}