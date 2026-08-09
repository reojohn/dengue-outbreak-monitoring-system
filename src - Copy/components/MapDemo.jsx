const regions = [
  {
    id: 'Libertad',
    color: '#E29A3B',
    points: '70,80 190,74 214,146 122,180 40,140',
    labelX: 118,
    labelY: 126,
  },
  {
    id: 'Bancasi',
    color: '#D56A6A',
    points: '220,78 356,88 338,164 240,156',
    labelX: 286,
    labelY: 121,
  },
  {
    id: 'Ampayon',
    color: '#E29A3B',
    points: '368,92 560,104 540,196 388,184 350,136',
    labelX: 452,
    labelY: 145,
  },
  {
    id: 'Baan Km. 3',
    color: '#4D9A69',
    points: '44,156 112,188 102,264 32,272 10,210',
    labelX: 66,
    labelY: 238,
  },
  {
    id: 'Tiniwisan',
    color: '#D56A6A',
    points: '124,190 228,158 284,244 200,302 110,266',
    labelX: 190,
    labelY: 257,
  },
  {
    id: 'Doongan',
    color: '#4D9A69',
    points: '240,170 336,174 352,266 290,314 282,248',
    labelX: 291,
    labelY: 258,
  },
  {
    id: 'Holy Redeemer',
    color: '#E29A3B',
    points: '364,202 538,216 532,294 378,304',
    labelX: 448,
    labelY: 268,
    labelLines: ['Holy', 'Redeemer'],
  },
  {
    id: 'Obrero',
    color: '#4D9A69',
    points: '34,284 110,274 148,356 86,420 14,362',
    labelX: 70,
    labelY: 360,
  },
  {
    id: 'Ambago',
    color: '#E29A3B',
    points: '118,318 198,316 238,404 168,458 88,422',
    labelX: 164,
    labelY: 394,
  },
  {
    id: 'Maon',
    color: '#4D9A69',
    points: '212,328 308,326 346,432 246,462',
    labelX: 257,
    labelY: 397,
  },
  {
    id: 'Lumbocan',
    color: '#E29A3B',
    points: '320,320 526,306 548,452 360,476',
    labelX: 437,
    labelY: 397,
  },
]

export default function MapDemo({ selected, onSelect }) {
  return (
    <svg viewBox="0 0 620 520" className="h-full w-full rounded-[22px] bg-sky-50/70">
      <path
        d="M308 30 C292 90, 322 132, 304 190 C288 242, 322 298, 306 350 C292 404, 328 450, 310 504"
        fill="none"
        stroke="#9FC8EB"
        strokeWidth="24"
        strokeLinecap="round"
      />
      <path
        d="M308 30 C292 90, 322 132, 304 190 C288 242, 322 298, 306 350 C292 404, 328 450, 310 504"
        fill="none"
        stroke="#CFE4F7"
        strokeWidth="12"
        strokeLinecap="round"
      />

      {regions.map((region) => (
        <g key={region.id} className="cursor-pointer" onClick={() => onSelect(region.id)}>
          <polygon
            points={region.points}
            fill={region.color}
            stroke="#FFFFFF"
            strokeWidth="3"
            opacity={selected === region.id ? 1 : 0.92}
          />

          {region.labelLines ? (
            <text
              x={region.labelX}
              y={region.labelY}
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="18"
              fontWeight="700"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {region.labelLines.map((line, index) => (
                <tspan
                  key={line}
                  x={region.labelX}
                  dy={index === 0 ? 0 : 20}
                >
                  {line}
                </tspan>
              ))}
            </text>
          ) : (
            <text
              x={region.labelX}
              y={region.labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#FFFFFF"
              fontSize={region.id === 'Baan Km. 3' ? '15' : '18'}
              fontWeight="700"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {region.id}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}