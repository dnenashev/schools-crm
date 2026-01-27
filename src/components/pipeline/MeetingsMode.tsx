const MeetingsMode = () => {
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
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" 
          />
        </svg>
        
        <h2 className="text-2xl font-bold text-gray-800 mb-3">
          Режим встреч
        </h2>
        
        <p className="text-gray-500 mb-6">
          Этот режим находится в разработке. Здесь будет календарь встреч 
          и удобный интерфейс для планирования и отчетности.
        </p>
        
        <div className="p-4 bg-gray-50 rounded-lg text-left text-sm text-gray-600">
          <p className="font-medium text-gray-700 mb-2">Планируемые функции:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Календарь запланированных встреч</li>
            <li>Планирование новых встреч</li>
            <li>Отметка о проведении встречи</li>
            <li>Внесение результатов встречи</li>
            <li>Напоминания о предстоящих встречах</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default MeetingsMode
