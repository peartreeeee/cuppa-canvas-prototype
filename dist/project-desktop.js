(() => {
  const desktop = document.getElementById('project-desktop');
  const workspace = document.getElementById('workspace');
  const traditional = document.getElementById('traditional-desktop');
  const openCuppa = document.getElementById('open-cuppa');
  const createProject = document.getElementById('create-project');
  const clock = document.getElementById('desktop-time');
  const date = document.getElementById('desktop-date');
  const timeZone = 'Asia/Shanghai';
  const timeFormat = new Intl.DateTimeFormat('zh-CN', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const dateFormat = new Intl.DateTimeFormat('zh-CN', {
    timeZone, month: 'long', day: 'numeric', weekday: 'long'
  });
  const lunarFormat = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
    timeZone, month: 'long', day: 'numeric'
  });
  const projectListKey = 'design-canvas-projects';

  function readProjects() {
    try {
      const projects = JSON.parse(localStorage.getItem(projectListKey));
      return Array.isArray(projects) ? projects : [];
    } catch {
      return [];
    }
  }

  const projectName = readProjects().find(project => project.id === projectId)?.name || 'CUPPA';
  document.querySelectorAll('[data-project-name]').forEach(label => {
    label.textContent = projectName;
    label.title = projectName;
  });

  function updateClock() {
    const now = new Date();
    clock.textContent = timeFormat.format(now);
    const lunar = lunarFormat.formatToParts(now);
    const month = lunar.find(part => part.type === 'month')?.value || '';
    const day = Number(lunar.find(part => part.type === 'day')?.value);
    const digits = '〇一二三四五六七八九十';
    const lunarDay = day <= 10 ? '初' + digits[day]
      : day < 20 ? '十' + digits[day - 10]
      : day === 20 ? '二十'
      : day < 30 ? '廿' + digits[day - 20] : day === 30 ? '三十' : '';
    date.textContent = dateFormat.format(now) + (month && lunarDay ? ' ' + month + lunarDay : '');
  }

  function showScreen(moveFocus) {
    const canvasVisible = location.hash === '#cuppa';
    const traditionalVisible = location.hash === '#traditional-desktop';
    workspace.hidden = !canvasVisible;
    traditional.hidden = !traditionalVisible;
    desktop.hidden = canvasVisible || traditionalVisible;

    document.title = canvasVisible ? projectName + ' · 设计探索工作台'
      : traditionalVisible ? '传统桌面' : '项目空间桌面';

    if (!desktop.hidden) updateClock();
    if (!moveFocus) return;
    const focusTarget = canvasVisible ? document.getElementById('workspace')
      : traditionalVisible ? traditional : openCuppa;
    focusTarget.focus({ preventScroll: true });
  }

  function navigate(hash) {
    if (location.hash !== hash) location.hash = hash;
  }

  function openProject(id) {
    if (id === projectId) {
      navigate('#cuppa');
      return;
    }
    const url = new URL(location.href);
    if (id) url.searchParams.set('project', id);
    else url.searchParams.delete('project');
    url.hash = 'cuppa';
    location.assign(url);
  }

  const dialog = document.getElementById('project-create-dialog');
  document.getElementById('close-project-create').onclick = () => dialog.close();
  createProject.addEventListener('click', () => {
    const form = dialog.querySelector('form');
    const list = dialog.querySelector('.project-create-list');
    form.reset();
    form.querySelector('.project-create-error').textContent = '';
    list.replaceChildren();
    for (const project of readProjects()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = project.name;
      button.onclick = () => {
        dialog.close();
        openProject(project.id);
      };
      list.append(button);
    }
    form.onsubmit = event => {
      event.preventDefault();
      const name = form.elements.name.value.trim();
      if (!name) return;
      const project = { id: crypto.randomUUID(), name };
      try {
        localStorage.setItem(projectListKey, JSON.stringify([...readProjects(), project]));
      } catch {
        form.querySelector('.project-create-error').textContent = '当前浏览器无法保存项目。';
        return;
      }
      openProject(project.id);
    };
    dialog.showModal();
    form.elements.name.focus();
  });
  openCuppa.addEventListener('click', () => openProject(''));
  document.getElementById('projects').addEventListener('click', () => navigate('#projects'));
  document.getElementById('open-traditional-desktop').addEventListener('click', () => navigate('#traditional-desktop'));
  window.addEventListener('hashchange', () => showScreen(true));
  window.addEventListener('keydown', event => {
    if (!workspace.hidden) return;
    if (!traditional.hidden && event.key === 'Escape') {
      event.preventDefault();
      navigate('#projects');
    }
    event.stopPropagation();
  }, true);
  window.addEventListener('paste', event => {
    if (workspace.hidden) event.stopPropagation();
  }, true);

  showScreen(false);
  window.setInterval(() => {
    if (!desktop.hidden) updateClock();
  }, 1000);
})();
