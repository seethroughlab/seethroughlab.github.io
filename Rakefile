
task :default => :preview
 
desc 'Build site with Jekyll'
task :build do
  jekyll 'build'
end
 
desc 'Build and start server with --watch'
task :serve do
  jekyll 'serve --watch --drafts'
end

def jekyll(opts = '')
  delete '_site'
  sh 'bundle exec jekyll ' + opts
end

def delete(folder)
  Dir.glob(folder).each { |f| File.delete(f) }
end