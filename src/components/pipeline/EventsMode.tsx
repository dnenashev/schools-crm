const EventsMode = () => {
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
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" 
          />
        </svg>
        
        <h2 className="text-2xl font-bold text-gray-800 mb-3">
          Режим мероприятий
        </h2>
        
        <p className="text-gray-500 mb-6">
          Этот режим находится в разработке. Здесь будет управление мероприятиями 
          в школах с отчетностью по результатам.
        </p>
        
        <div className="p-4 bg-gray-50 rounded-lg text-left text-sm text-gray-600">
          <p className="font-medium text-gray-700 mb-2">Планируемые функции:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Список запланированных мероприятий</li>
            <li>Планирование новых мероприятий</li>
            <li>Внесение результатов (классы, лиды, родители)</li>
            <li>Статистика по мероприятиям</li>
            <li>Отчеты по эффективности</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default EventsMode
