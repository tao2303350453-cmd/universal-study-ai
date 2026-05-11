import React, { useState, useEffect } from 'react';

// 这是一个可以自己调用自己的组件，用来实现无限级分类
const CategoryNode = ({ category, allCategories, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  // 找出所有属于当前分类的“子类”
  const children = allCategories.filter(c => c.parent_id === category.id);

  return (
    <div className="ml-4">
      <div 
        className="flex items-center p-2 cursor-pointer hover:bg-slate-800 rounded text-gray-300"
        onClick={() => {
          setIsOpen(!isOpen);
          onSelect(category);
        }}
      >
        <span className="mr-2 text-xs text-blue-500">
          {children.length > 0 ? (isOpen ? '▼' : '▶') : '•'}
        </span>
        <i className="fas fa-folder mr-2 opacity-70"></i>
        {category.name}
      </div>
      {isOpen && children.map(child => (
        <CategoryNode key={child.id} category={child} allCategories={allCategories} onSelect={onSelect} />
      ))}
    </div>
  );
};

function App() {
  const [categories, setCategories] = useState([]);
  const [currentCategory, setCurrentCategory] = useState(null);

  // 初始化：从后端获取所有分类
  useEffect(() => {
    fetch('/api/categories')
      .then(res => res.json())
      .then(data => setCategories(data));
  }, []);

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* 侧边栏：学科中心 */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col p-4">
        <h1 className="text-xl font-bold mb-6 border-b border-slate-800 pb-4">学科中心</h1>
        <div className="flex-1 overflow-y-auto">
          {/* 只渲染一级学科（没有父级的项） */}
          {categories.filter(c => !c.parent_id).map(rootCat => (
            <CategoryNode 
              key={rootCat.id} 
              category={rootCat} 
              allCategories={categories} 
              onSelect={setCurrentCategory} 
            />
          ))}
        </div>
        <button className="mt-4 p-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition">
          + 新建一级学科
        </button>
      </aside>

      {/* 主界面：文件与聊天 */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b flex items-center px-8 justify-between shadow-sm">
          <h2 className="text-lg font-semibold text-gray-700">
            {currentCategory ? `当前：${currentCategory.name}` : "请选择学科"}
          </h2>
          {currentCategory && (
            <button className="px-4 py-2 bg-emerald-500 text-white rounded-full text-sm hover:bg-emerald-600">
              添加子分类 / 喂入文档
            </button>
          )}
        </header>

        <div className="flex-1 p-6 overflow-y-auto">
          {/* 这里放置聊天气泡或文件列表 */}
          <div className="text-center text-gray-400 mt-20 italic">
            {currentCategory 
              ? `已进入 [${currentCategory.name}]，你可以开始对话或整理文件。` 
              : "点击左侧学科开始学习之旅"}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
