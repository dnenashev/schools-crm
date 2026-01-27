const CallsMode = () => {
  return (
    <div className="bg-white rounded-lg shadow p-12 text-center">
      <div className="max-w-md mx-auto">
        <svg 
          className="w-20 h-20 mx-auto mb-6 text-gray-300" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={1.5} 
            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" 
          />
        </svg>
        
        <h2 className="text-2xl font-bold text-gray-800 mb-3">
          Режим звонков
        </h2>
        
        <p className="text-gray-500 mb-6">
          Этот режим находится в разработке. Здесь будет удобный интерфейс 
          для обзвона школ с автоматической очередью и быстрым вводом результатов.
        </p>
        
        <div className="p-4 bg-gray-50 rounded-lg text-left text-sm text-gray-600">
          <p className="font-medium text-gray-700 mb-2">Планируемые функции:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Очередь школ для обзвона</li>
            <li>Фильтры по статусам и приоритетам</li>
            <li>Быстрый ввод результата звонка</li>
            <li>История звонков по каждой школе</li>
            <li>Автоматическое планирование перезвонов</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default CallsMode
